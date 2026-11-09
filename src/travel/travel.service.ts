import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Travel, TravelStatus } from './travel.entity.js';
import { Ride, RideStatus } from '../rides/ride.entity.js';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';
import { BookingService } from '../bookings/bookings.service.js';
import {
  departureTimestampMs,
  isWithinDepartureWindow,
  readWindowMinutes,
  resolveAppTimezone,
} from '../common/time/time.util.js';
import { ParticipantLocation } from './participant-location.entity.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import { User } from '../users/user.entity.js';
import { GpsValidationService } from './gps-validation.service.js';
import { GpsOutlierDetectionService } from './gps-outlier-detection.service.js';

// Config keys + fallback defaults for the valid time window around travel start
// (30 minutes before, 120 minutes after).
const WINDOW_BEFORE_KEY = 'TRAVEL_START_WINDOW_BEFORE_MINUTES';
const WINDOW_AFTER_KEY = 'TRAVEL_START_WINDOW_AFTER_MINUTES';
const DEFAULT_BEFORE_MINUTES = 30;
const DEFAULT_AFTER_MINUTES = 120;

@Injectable()
export class TravelService {
  constructor(
    // Used only for the fast pre-check before we take any locks.
    @InjectRepository(Ride)
    private readonly rideRepository: Repository<Ride>,

    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,

    @InjectRepository(Travel)
    private readonly travelRepository: Repository<Travel>,

    @InjectRepository(ParticipantLocation)
    private readonly participantLocationRepository: Repository<ParticipantLocation>,

    // Reused so the request-reopen rule lives in exactly one place.
    private readonly bookingService: BookingService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,

    // Validates GPS coordinates and classifies reading quality.
    private readonly gpsValidationService: GpsValidationService,

    // Detects physically unrealistic movement between consecutive readings.
    private readonly gpsOutlierDetectionService: GpsOutlierDetectionService,
  ) {}

  // True when `now` is within the driver-configured start window around the
  // ride's departure, interpreted in APP_TIMEZONE.
  private isWithinStartWindow(ride: Ride, now: Date): boolean {
    const timeZone = resolveAppTimezone(this.configService);

    const beforeMin = readWindowMinutes(
      this.configService,
      WINDOW_BEFORE_KEY,
      DEFAULT_BEFORE_MINUTES,
    );

    const afterMin = readWindowMinutes(
      this.configService,
      WINDOW_AFTER_KEY,
      DEFAULT_AFTER_MINUTES,
    );

    const departureMs = departureTimestampMs(
      ride.departureDate,
      ride.departureTime,
      timeZone,
    );

    return isWithinDepartureWindow(
      now.getTime(),
      departureMs,
      beforeMin,
      afterMin,
    );
  }

  /**
   * Start the travel for a scheduled ride. In one transaction it:
   *   1. rejects every still-pending booking (applying the shared reopen rule),
   *   2. creates the Travel (in_progress) copying the ride's route,
   *   3. marks the ride ongoing.
   *
   * Approved bookings are left untouched - they become the travel's passengers.
   * A second start for the same ride fails with a 409.
   *
   * Lock order: pending bookings (ordered by id) and their ride requests first,
   * then the ride row last. The ride is never locked while a booking or request
   * lock is being acquired, which keeps this transaction deadlock-free against
   * approve/cancel (booking -> ride) and reject (booking -> request).
   */
  async startTravel(rideId: string, driverId: string, now = new Date()) {
    // Fast pre-checks (no locks) so clearly invalid requests fail cheaply.
    const ride = await this.rideRepository.findOne({
      where: { id: rideId },
      relations: ['driver'],
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.driver.id !== driverId) {
      throw new ConflictException('You can only start your own ride');
    }

    if (ride.status !== RideStatus.SCHEDULED) {
      throw new ConflictException('Only a scheduled ride can be started');
    }

    if (!this.isWithinStartWindow(ride, now)) {
      throw new BadRequestException(
        'Now is not within the allowed window to start this ride',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const rideRepository = manager.getRepository(Ride);
      const travelRepository = manager.getRepository(Travel);

      // 1. Reject every still-pending booking. We lock the rows alone (no
      //    relation joins) ordered by id, then load each booking's nullable
      //    rideRequest in a second query before applying the shared reopen rule.
      const pendingBookings = await bookingRepository.find({
        where: {
          ride: { id: rideId },
          status: BookingStatus.PENDING,
        },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      for (const locked of pendingBookings) {
        const booking = await bookingRepository.findOne({
          where: { id: locked.id },
          relations: ['rideRequest'],
        });

        if (!booking) {
          continue;
        }

        booking.status = BookingStatus.REJECTED;
        await bookingRepository.save(booking);

        // Single source of truth for the request-reopen rule.
        await this.bookingService.reopenRequestIfNoOtherActiveBookings(
          manager,
          booking,
        );
      }

      // Known residual race (documented, not fixed here): ride-request
      // acceptance may create a pending booking after the snapshot above.
      const lockedRide = await rideRepository.findOne({
        where: { id: rideId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedRide) {
        throw new NotFoundException('Ride not found');
      }

      if (lockedRide.status !== RideStatus.SCHEDULED) {
        throw new ConflictException('Only a scheduled ride can be started');
      }

      // A ride may have at most one travel.
      const existingTravel = await travelRepository.findOne({
        where: { ride: { id: rideId } },
      });

      if (existingTravel) {
        throw new ConflictException('This ride has already been started');
      }

      // Load the ride's relations in a second query because the lock query
      // intentionally did not join them.
      const fullRide = await rideRepository.findOne({
        where: { id: rideId },
        relations: ['driver'],
      });

      if (!fullRide) {
        throw new NotFoundException('Ride not found');
      }

      const travel = travelRepository.create({
        status: TravelStatus.IN_PROGRESS,
        startedAt: now,
        driver: fullRide.driver,
        ride: fullRide,
        origin: fullRide.origin,
        destination: fullRide.destination,
      });

      // The unique travels.rideId constraint prevents concurrent duplicate starts.
      try {
        await travelRepository.save(travel);
      } catch (error) {
        const code =
          (error as { code?: string }).code ??
          (error as { driverError?: { code?: string } }).driverError?.code;

        if (code === '23505') {
          throw new ConflictException('This ride has already been started');
        }

        throw error;
      }

      // Mark the ride ongoing and persist it.
      lockedRide.status = RideStatus.ONGOING;
      await rideRepository.save(lockedRide);

      // Return the travel without leaking the driver's password.
      const { password, ...safeDriver } = travel.driver;

      return {
        ...travel,
        driver: safeDriver,
      };
    });
  }

  /**
   * End the travel for an ongoing ride. In one transaction it:
   *   1. rejects every still-pending booking,
   *   2. completes the Travel,
   *   3. marks the ride completed.
   *
   * Approved bookings are left untouched.
   */
  async endTravel(rideId: string, driverId: string, now = new Date()) {
    // Fast pre-checks (no locks) so clearly invalid requests fail cheaply.
    const ride = await this.rideRepository.findOne({
      where: { id: rideId },
      relations: ['driver'],
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.driver.id !== driverId) {
      throw new ConflictException('You can only end your own ride');
    }

    if (ride.status !== RideStatus.ONGOING) {
      throw new ConflictException('Only an ongoing ride can be ended');
    }

    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const rideRepository = manager.getRepository(Ride);
      const travelRepository = manager.getRepository(Travel);

      // Reject every still-pending booking.
      const pendingBookings = await bookingRepository.find({
        where: {
          ride: { id: rideId },
          status: BookingStatus.PENDING,
        },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      for (const locked of pendingBookings) {
        const booking = await bookingRepository.findOne({
          where: { id: locked.id },
          relations: ['rideRequest'],
        });

        if (!booking) {
          continue;
        }

        booking.status = BookingStatus.REJECTED;
        await bookingRepository.save(booking);

        await this.bookingService.reopenRequestIfNoOtherActiveBookings(
          manager,
          booking,
        );
      }

      // Lock the ride row last and revalidate its status.
      const lockedRide = await rideRepository.findOne({
        where: { id: rideId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedRide) {
        throw new NotFoundException('Ride not found');
      }

      if (lockedRide.status !== RideStatus.ONGOING) {
        throw new ConflictException('Only an ongoing ride can be ended');
      }

      // Load the travel without relation joins.
      const travel = await travelRepository.findOne({
        where: { ride: { id: rideId } },
      });

      if (!travel) {
        throw new ConflictException('No travel exists for this ride');
      }

      if (travel.status !== TravelStatus.IN_PROGRESS) {
        throw new ConflictException('This travel has already been completed');
      }

      // Complete the travel and ride atomically.
      travel.status = TravelStatus.COMPLETED;
      travel.completedAt = now;
      await travelRepository.save(travel);

      lockedRide.status = RideStatus.COMPLETED;
      await rideRepository.save(lockedRide);

      // Return a safe driver object without the password.
      const { password, ...safeDriver } = ride.driver;

      return {
        ...travel,
        driver: safeDriver,
      };
    });
  }

  /**
   * Save a participant's GPS observation after validating:
   *   1. GPS coordinate ranges and accuracy,
   *   2. travel status,
   *   3. participant authorization,
   *   4. movement plausibility against their previous reading.
   */
  async updateParticipantLocation(
    travelId: string,
    participantId: string,
    dto: UpdateLocationDto,
  ) {
    // Validate the GPS reading before allowing it into the tracking pipeline.
    const validation = this.gpsValidationService.validate({
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
    });

    if (!validation.valid) {
      throw new BadRequestException(validation.reason);
    }

    // Find the Travel and load its Ride and driver.
    const travel = await this.travelRepository.findOne({
      where: { id: travelId },
      relations: ['ride', 'ride.driver'],
    });

    if (!travel) {
      throw new NotFoundException('Travel not found');
    }

    // Location updates are allowed only while the Travel is active.
    if (travel.status !== TravelStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Location updates are only allowed for an active travel',
      );
    }

    // Verify that the authenticated user belongs to this Travel.
    const isDriver = travel.ride.driver?.id === participantId;

    if (!isDriver) {
      const booking = await this.bookingRepository.findOne({
        where: {
          ride: { id: travel.ride.id },
          passenger: { id: participantId },
          status: BookingStatus.APPROVED,
        },
      });

      if (!booking) {
        throw new ForbiddenException(
          'You are not an approved participant of this travel',
        );
      }
    }

    // Retrieve this participant's most recent GPS reading for this Travel.
    const previousLocation = await this.participantLocationRepository.findOne({
      where: {
        travel: { id: travelId },
        participant: { id: participantId },
      },
      order: {
        recordedAt: 'DESC',
      },
    });

    // Create one timestamp for the incoming GPS observation.
    const recordedAt = new Date();

    // Validate movement for both the driver and approved passengers.
    const movementValidation = this.gpsOutlierDetectionService.validateMovement(
      previousLocation
        ? {
            latitude: Number(previousLocation.latitude),
            longitude: Number(previousLocation.longitude),
            recordedAt: previousLocation.recordedAt,
          }
        : null,
      {
        latitude: dto.latitude,
        longitude: dto.longitude,
        recordedAt,
      },
    );

    // Reject readings that indicate unrealistic movement.
    if (!movementValidation.valid) {
      throw new BadRequestException(movementValidation.reason);
    }

    // Store the participant's raw GPS observation.
    const location = this.participantLocationRepository.create({
      travel: { id: travelId } as Travel,
      participant: { id: participantId } as User,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
      recordedAt,
    });
    
    const savedLocation =
      await this.participantLocationRepository.save(location);

    return {
      message: 'Location received successfully',
      location: savedLocation,
    };
  }
}
