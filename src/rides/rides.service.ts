import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { Ride, RideStatus } from './ride.entity.js';
import { Vehicle } from '../vehicles/vehicle.entity.js';
import { UserService } from '../users/user.service.js';

import { CreateRideDto } from './dto/create-ride-dto.js';
import { SearchRidesDto } from './dto/search-rides.dto.js';
import { UpdateRideDto } from './dto/update-ride-dto.js';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';
import {
  RideRequest,
  RideRequestStatus,
} from '../ride-request/ride-request.entity.js';
import {
  departureTimestampMs,
  resolveAppTimezone,
} from '../common/time/time.util.js';


  //Raw row shape returned by the search query builder.
 // Fields typed as `string | number` because PostgreSQL numeric columns
 // come back as strings; the service normalizes them with Number().
 
interface SearchRideRow {
  id: string;
  origin: string;
  destination: string;
  departureDate: string | Date;
  departureTime: string;
  pricePerSeat: string | number;
  availableSeats: string | number;
  status: RideStatus;
  driverId: string;
  driverFirstName: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleCapacity: string | number;
}

// Public shape of a ride returned by the search endpoint.
 // Normalizes row types, nests driver/vehicle, and exposes only safe fields.
export interface SearchRideItem {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  pricePerSeat: number;
  availableSeats: number;
  status: RideStatus;
  driver: { id: string; firstName: string };
  vehicle: { model: string; color: string; capacity: number };
}

 //Paginated envelope for search results, including total count and page metadata.
 export interface SearchRidesResult {
  items: SearchRideItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class RidesService {
  constructor(
    // Repository used to create and save rides.
    @InjectRepository(Ride)
    private readonly rideRepository: Repository<Ride>,

    // Repository used to find the vehicle selected by the driver.
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,

    // Used to find the authenticated user.
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    @Optional()
    @InjectRepository(Booking)
    private readonly bookingRepository?: Repository<Booking>,
    @Optional()
    @InjectDataSource()
    private readonly dataSource?: DataSource,
  ) {}

  // Derive the current wall-clock date/time in the configured departure timezone.
  private getCurrentLocalDateTime(now: Date): { date: string; time: string } {
    const timeZone =
      this.configService.get<string>('APP_TIMEZONE')?.trim() || 'Africa/Douala';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';

    return {
      date: `${value('year')}-${value('month')}-${value('day')}`,
      time: `${value('hour')}:${value('minute')}:${value('second')}`,
    };
  }

  // Escape SQL LIKE metacharacters so search text is treated literally.
  private escapeLikeSubstring(value: string): string {
    return value.replace(/[!%_\\]/g, '!$&');
  }
  //Takes a SearchRidesDto (validated input from the controller) and returns a paginated SearchRidesResult.
  // Search scheduled future rides and return only public ride, driver, and vehicle fields.
  async search(query: SearchRidesDto): Promise<SearchRidesResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const minimumSeats = query.minSeats ?? 1;
    const localNow = this.getCurrentLocalDateTime(new Date());

    const rideQuery = this.rideRepository
      .createQueryBuilder('ride')
      .leftJoin('ride.driver', 'driver')
      .leftJoin('ride.vehicle', 'vehicle')
      .select('ride.id', 'id')
      .addSelect('ride.origin', 'origin')
      .addSelect('ride.destination', 'destination')
      .addSelect('ride.departureDate', 'departureDate')
      .addSelect('ride.departureTime', 'departureTime')
      .addSelect('ride.seatPerPrice', 'pricePerSeat')
      .addSelect('ride.availableSeat', 'availableSeats')
      .addSelect('ride.status', 'status')
      .addSelect('driver.id', 'driverId')
      .addSelect('driver.firstName', 'driverFirstName')
      .addSelect('vehicle.model', 'vehicleModel')
      .addSelect('vehicle.color', 'vehicleColor')
      .addSelect('vehicle.seats', 'vehicleCapacity')
      .where('ride.status = :scheduledStatus', {
        scheduledStatus: RideStatus.SCHEDULED,
      })
      .andWhere('ride.availableSeat >= :minimumSeats', { minimumSeats })
      // Compare stored local date/time to the configured zone's current local date/time.
      .andWhere(
        '(ride.departureDate > :localDate OR (ride.departureDate = :localDate AND ride.departureTime > :localTime))',
        { localDate: localNow.date, localTime: localNow.time },
      );

    if (query.origin !== undefined) {
      const pattern = `%${this.escapeLikeSubstring(query.origin.trim())}%`;
      rideQuery.andWhere("BTRIM(ride.origin) ILIKE :originPattern ESCAPE '!'", {
        originPattern: pattern,
      });
    }

    if (query.destination !== undefined) {
      const pattern = `%${this.escapeLikeSubstring(query.destination.trim())}%`;
      rideQuery.andWhere(
        "BTRIM(ride.destination) ILIKE :destinationPattern ESCAPE '!'",
        { destinationPattern: pattern },
      );
    }

    if (query.date !== undefined) {
      rideQuery.andWhere('ride.departureDate = :departureDate', {
        departureDate: query.date,
      });
    }

    if (query.maxPricePerSeat !== undefined) {
      rideQuery.andWhere('ride.seatPerPrice <= :maxPricePerSeat', {
        maxPricePerSeat: query.maxPricePerSeat,
      });
    }

    rideQuery
      .orderBy('ride.departureDate', 'ASC')
      .addOrderBy('ride.departureTime', 'ASC')
      .addOrderBy('ride.id', 'ASC');

    const total = await rideQuery.getCount();
    const rows = await rideQuery
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany<SearchRideRow>();

    return {
      items: rows.map((row) => ({
        id: row.id,
        origin: row.origin,
        destination: row.destination,
        departureDate:
          typeof row.departureDate === 'string'
            ? row.departureDate
            : row.departureDate.toISOString().slice(0, 10),
        departureTime: row.departureTime,
        pricePerSeat: Number(row.pricePerSeat),
        availableSeats: Number(row.availableSeats),
        status: row.status,
        driver: { id: row.driverId, firstName: row.driverFirstName },
        vehicle: {
          model: row.vehicleModel,
          color: row.vehicleColor,
          capacity: Number(row.vehicleCapacity),
        },
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(userId: string, createRideDto: CreateRideDto): Promise<any> {
    // Find the authenticated user who is creating the ride.
    const driver = await this.userService.findById(userId);

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Find the vehicle selected by the driver. We also load the owner so that we can verify ownership.
    const vehicle = await this.vehicleRepository.findOne({
      where: {
        id: createRideDto.vehicleId,
      },
      relations: ['owner'],
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.owner.id !== userId) {
      throw new ForbiddenException('You can only use your own vehicle');
    }

    // A driver cannot make more seats available than the actual capacity of the vehicle.
    if (createRideDto.availableSeats > vehicle.seats) {
      throw new BadRequestException(
        'Available seats cannot exceed vehicle capacity',
      );
    }

    // Do not allow a scheduled ride to be created in the past.
    const departureTimestamp = departureTimestampMs(
      createRideDto.departureDate,
      createRideDto.departureTime,
      resolveAppTimezone(this.configService),
    );
    if (!Number.isFinite(departureTimestamp) || departureTimestamp <= Date.now()) {
      throw new BadRequestException('The ride departure must be in the future');
    }

    // Create the ride using the information from the DTO.
    const ride = this.rideRepository.create({
      origin: createRideDto.origin,
      destination: createRideDto.destination,

      // Convert the date received from the request into a JavaScript Date object.
      departureDate: new Date(createRideDto.departureDate),
      departureTime: createRideDto.departureTime,
      totalSeat: vehicle.seats,
      availableSeat: createRideDto.availableSeats,
      seatPerPrice: createRideDto.pricePerSeat,
      // The authenticated user becomes the driver.
      driver,
      // The selected vehicle is associated with the ride.
      vehicle,
    });

    /// Save the ride in PostgreSQL.
    const savedRide = await this.rideRepository.save(ride);

    // Remove the password from the driver before returning the response.
    const { password: driverPassword, ...safeDriver } = savedRide.driver;

    // Remove the password from the vehicle owner before returning the response.
    const { password: ownerPassword, ...safeOwner } = savedRide.vehicle.owner;

    // Return a safe version of the ride.The database record itself is NOT modified.
    return {
      ...savedRide,

      // Driver information without the password.
      driver: safeDriver,

      // Vehicle information with the owner password removed.
      vehicle: {
        ...savedRide.vehicle,
        owner: safeOwner,
      },
    };
  }

  // Update a scheduled ride without bypassing ownership, future-time, or capacity rules.
  async update(
    rideId: string,
    driverId: string,
    updateRideDto: UpdateRideDto,
  ): Promise<any> {
    if (Object.keys(updateRideDto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    if (!this.dataSource) {
      throw new BadRequestException('Ride update service is unavailable');
    }

    return this.dataSource.transaction(async (manager) => {
      const rideRepository = manager.getRepository(Ride);

      // Lock the ride so a concurrent start/cancel cannot race with this update.
      const ride = await rideRepository.findOne({
        where: { id: rideId },
        relations: ['driver', 'vehicle'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!ride) {
        throw new NotFoundException('Ride not found');
      }
      if (ride.driver.id !== driverId) {
        throw new ForbiddenException('You can only update your own rides');
      }
      if (ride.status !== RideStatus.SCHEDULED) {
        throw new ConflictException('Only scheduled rides can be updated');
      }

      const departureDate =
        updateRideDto.departureDate ??
        (typeof ride.departureDate === 'string'
          ? ride.departureDate
          : ride.departureDate.toISOString().slice(0, 10));
      const departureTime =
        updateRideDto.departureTime ?? ride.departureTime;
      const departureTimestamp = departureTimestampMs(
        departureDate,
        departureTime,
        resolveAppTimezone(this.configService),
      );

      // Comments explain the wall-clock rule: ride times use APP_TIMEZONE.
      if (
        !Number.isFinite(departureTimestamp) ||
        departureTimestamp <= Date.now()
      ) {
        throw new BadRequestException(
          'The ride departure must be in the future',
        );
      }

      let vehicle = ride.vehicle;
      if (updateRideDto.vehicleId) {
        const selectedVehicle = await manager.getRepository(Vehicle).findOne({
          where: { id: updateRideDto.vehicleId },
          relations: ['owner'],
        });

        if (!selectedVehicle) {
          throw new NotFoundException('Vehicle not found');
        }
        if (selectedVehicle.owner.id !== driverId) {
          throw new ForbiddenException('You can only use your own vehicle');
        }
        vehicle = selectedVehicle;
      }

      // Approved bookings reserve seats. Pending bookings do not reduce availability.
      const approvedBookings = await manager.getRepository(Booking).find({
        where: {
          ride: { id: rideId },
          status: BookingStatus.APPROVED,
        },
      });
      const approvedSeats = approvedBookings.reduce(
        (total: number, booking: Booking) => total + booking.seats,
        0,
      );

      let desiredAvailableSeats =
        updateRideDto.availableSeats ?? ride.availableSeat;
      const desiredTotalSeats =
        updateRideDto.vehicleId ? vehicle.seats : ride.totalSeat;

      if (updateRideDto.vehicleId) {
        // Changing vehicles resets total capacity and preserves approved reservations.
        ride.totalSeat = vehicle.seats;
        if (updateRideDto.availableSeats === undefined) {
          desiredAvailableSeats = Math.max(vehicle.seats - approvedSeats, 0);
          ride.availableSeat = desiredAvailableSeats;
        }
      }

      if (desiredAvailableSeats > desiredTotalSeats) {
        throw new BadRequestException(
          'Available seats cannot exceed vehicle capacity',
        );
      }
      if (approvedSeats + desiredAvailableSeats > desiredTotalSeats) {
        throw new BadRequestException(
          `Available seats cannot be lower than the ride requirements; ${approvedSeats} seat(s) are already approved`,
        );
      }

      if (updateRideDto.origin !== undefined) ride.origin = updateRideDto.origin;
      if (updateRideDto.destination !== undefined) {
        ride.destination = updateRideDto.destination;
      }
      if (updateRideDto.departureDate !== undefined) {
        ride.departureDate = new Date(updateRideDto.departureDate);
      }
      if (updateRideDto.departureTime !== undefined) {
        ride.departureTime = updateRideDto.departureTime;
      }
      if (updateRideDto.pricePerSeat !== undefined) {
        ride.seatPerPrice = updateRideDto.pricePerSeat;
      }
      if (updateRideDto.availableSeats !== undefined) {
        ride.availableSeat = updateRideDto.availableSeats;
      }
      ride.vehicle = vehicle;

      const savedRide = await rideRepository.save(ride);
      const reloadedRide = await rideRepository.findOne({
        where: { id: savedRide.id },
        relations: ['driver', 'vehicle', 'vehicle.owner'],
      });

      if (!reloadedRide) {
        return savedRide;
      }

      // Remove credential fields before the updated ride is returned.
      const { password: driverPassword, ...safeDriver } = reloadedRide.driver;
      const { password: ownerPassword, ...safeOwner } =
        reloadedRide.vehicle.owner;

      return {
        ...reloadedRide,
        driver: safeDriver,
        vehicle: {
          ...reloadedRide.vehicle,
          owner: safeOwner,
        },
      };
    });
  }

  // Cancel a ride and atomically transition all of its active bookings.
  async cancel(rideId: string, driverId: string): Promise<any> {
    if (!this.dataSource) {
      throw new BadRequestException('Ride cancellation service is unavailable');
    }

    return this.dataSource.transaction(async (manager) => {
      const rideRepository = manager.getRepository(Ride);

      // Lock the ride first so only one cancellation or lifecycle transition can win.
      const lockedRide = await rideRepository.findOne({
        where: { id: rideId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRide) {
        throw new NotFoundException('Ride not found');
      }

      const ride = await rideRepository.findOne({
        where: { id: rideId },
        relations: ['driver', 'vehicle', 'vehicle.owner'],
      });
      if (!ride) {
        throw new NotFoundException('Ride not found');
      }
      if (ride.driver.id !== driverId) {
        throw new ForbiddenException('You can only cancel your own rides');
      }
      if (ride.status !== RideStatus.SCHEDULED) {
        throw new ConflictException(
          `Ride cannot be cancelled because its status is "${ride.status}"`,
        );
      }

      const bookingRepository = manager.getRepository(Booking);
      const activeBookings = await bookingRepository.find({
        where: {
          ride: { id: rideId },
          status: In([BookingStatus.PENDING, BookingStatus.APPROVED]),
        },
        relations: ['rideRequest'],
        order: { id: 'ASC' },
      });

      for (const booking of activeBookings) {
        // Lock each booking while it changes state to avoid approval/cancellation races.
        const lockedBooking = await bookingRepository.findOne({
          where: { id: booking.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedBooking) continue;

        lockedBooking.status = BookingStatus.CANCELLED;
        await bookingRepository.save(lockedBooking);

        // Reopen linked ride requests when this was their final active booking.
        if (booking.rideRequest) {
          await this.reopenRideRequestIfUnneeded(manager, booking.rideRequest.id);
        }
      }

      ride.status = RideStatus.CANCELLED;
      const savedRide = await rideRepository.save(ride);

      const { password: driverPassword, ...safeDriver } = savedRide.driver;
      const { password: ownerPassword, ...safeOwner } =
        savedRide.vehicle.owner;

      return {
        ...savedRide,
        driver: safeDriver,
        vehicle: {
          ...savedRide.vehicle,
          owner: safeOwner,
        },
      };
    });
  }

  // Reopen an accepted ride request once no pending or approved booking still uses it.
  private async reopenRideRequestIfUnneeded(
    manager: EntityManager,
    rideRequestId: string,
  ): Promise<void> {
    const requestRepository = manager.getRepository(RideRequest);
    const rideRequest = await requestRepository.findOne({
      where: { id: rideRequestId },
      lock: { mode: 'pessimistic_write' },
    });

    if (
      !rideRequest ||
      rideRequest.status !== RideRequestStatus.ACCEPTED
    ) {
      return;
    }

    const activeCount = await manager.getRepository(Booking).count({
      where: {
        rideRequest: { id: rideRequestId },
        status: In([BookingStatus.PENDING, BookingStatus.APPROVED]),
      },
    });

    if (activeCount === 0) {
      rideRequest.status = RideRequestStatus.OPEN;
      rideRequest.ride = null;
      await requestRepository.save(rideRequest);
    }
  }
}
