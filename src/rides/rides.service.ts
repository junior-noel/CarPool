import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Ride, RideStatus } from './ride.entity.js';
import { Vehicle } from '../vehicles/vehicle.entity.js';
import { UserService } from '../users/user.service.js';

import { CreateRideDto } from './dto/create-ride-dto.js';
import { SearchRidesDto } from './dto/search-rides.dto.js';


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

    // Create the ride using the information from the DTO.
    const ride = this.rideRepository.create({
      origin: createRideDto.origin,

      destination: createRideDto.destination,

      // Convert the date received from the request into a JavaScript Date object.
      departureDate: new Date(createRideDto.departureDate),

      departureTime: createRideDto.departureTime,

      // The total number of seats comes from the vehicle. We don't allow the client to invent this value.
      totalSeat: vehicle.seats,

      // Number of seats the driver makes availableto passengers.
      availableSeat: createRideDto.availableSeats,

      // Map the DTO field to the entity field.
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
}
