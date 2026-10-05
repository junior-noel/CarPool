import { BadRequestException, ConflictException,Injectable, NotFoundException} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Travel, TravelStatus } from './travel.entity.js';
import { Ride, RideStatus } from '../rides/ride.entity.js';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';
import { BookingService } from '../bookings/bookings.service.js';
import { departureTimestampMs, isWithinDepartureWindow, readWindowMinutes, resolveAppTimezone,} from '../common/time/time.util.js';

// Config keys + fallback defaults for the valid time window around travel start (30 min before, 120 min after).
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

    // Reused so the request-reopen rule lives in exactly one place.
    private readonly bookingService: BookingService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
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
    return isWithinDepartureWindow(now.getTime(), departureMs, beforeMin, afterMin);
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
      // acceptance (RideRequestService.acceptRequest) creates PENDING bookings
      // after checking ride.status === SCHEDULED, but it reads the ride without
      // a lock. A concurrent accept could therefore insert a PENDING booking on
      // this ride between the snapshot above and the ride lock below, leaving
      // that booking stranded on an ongoing ride. Fully closing it would require
      // acceptRequest to also acquire the ride row lock (out of scope this step);
      // we intentionally do not hold the ride lock while locking bookings here,
      // which is what keeps the transaction deadlock-free.

      // 2. Lock the ride row last (no relation joins), then re-validate under
      //    the lock because other transactions may have changed it.
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

      // 3. Load the ride's relations in a second query (the lock query abov intentionally did not join them).
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

      // The unique travels.rideId constraint is the hard backstop against two
      // concurrent starts racing past the "no existing travel" check above.
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

      // 4. Mark the ride ongoing and persist it.
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
   *   1. rejects every still-pending booking (passengers who never boarded),
   *      reusing the shared request-reopen rule;
   *   2. completes the Travel (status -> completed, completedAt set);
   *   3. marks the ride completed.
   *
   * Approved bookings are left untouched - they are the travel's passengers.
   * Completing an already-completed (or cancelled) travel fails with a 409.
   *
   * Lock order: pending bookings (ordered by id) and their ride requests first,
   * then the ride row last. Because a ride has at most one travel, holding the
   * ride lock also serializes concurrent "end" calls, preventing double
   * completion. The ride is never locked while a booking or request lock is
   * being acquired, keeping this deadlock-free against approve/cancel/reject.
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

      // 1. Reject every still-pending booking (it did not board). Lock the rows
      //    alone (no relation joins) ordered by id, then load each booking's
      //    nullable rideRequest in a second query before applying the shared
      //    reopen rule. Only PENDING rows are selected, so approved bookings
      //    (and their requests) are never touched here.
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

      // 2. Lock the ride row last (no relation joins), then re-validate under the
      //    lock. Since a ride has at most one travel, this lock also prevents a
      //    concurrent "end" from racing past the travel status check below.
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

      // 3. Load the travel under the ride lock and confirm it exists and is still
      //    in progress. A completed/cancelled travel means it was already ended.
      //    No relation joins: the travel's `driver` OneToOne has no owning
      //    @JoinColumn, so loading it makes TypeORM fail in createJoinExpression
      //    ("Cannot read 'joinColumns' of undefined"). The driver is taken from
      //    the ride instead (it does not own a reliable driver FK of its own).
      const travel = await travelRepository.findOne({
        where: { ride: { id: rideId } },
      });

      if (!travel) {
        throw new ConflictException('No travel exists for this ride');
      }

      if (travel.status !== TravelStatus.IN_PROGRESS) {
        throw new ConflictException('This travel has already been completed');
      }

      // 4. Complete the travel and the ride atomically.
      travel.status = TravelStatus.COMPLETED;
      travel.completedAt = now;
      await travelRepository.save(travel);

      lockedRide.status = RideStatus.COMPLETED;
      await rideRepository.save(lockedRide);

      // The travel does not own a reliable driver FK, so report the ride's driver
      // (already loaded in the pre-check above) without leaking its password.
      const { password, ...safeDriver } = ride.driver;

      return {
        ...travel,
        driver: safeDriver,
      };
    });
  }
}
