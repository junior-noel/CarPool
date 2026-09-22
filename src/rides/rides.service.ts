import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Ride } from './ride.entity.js';
import { Vehicle } from '../vehicles/vehicle.entity.js';
import { UserService } from '../users/user.service.js';

import { CreateRideDto } from './dto/create-ride-dto.js';

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
  ) {}

  async create(userId: number, createRideDto: CreateRideDto): Promise<Ride> {
    // Find the authenticated user who is creating the ride.
    const driver = await this.userService.findById(userId);

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Find the vehicle selected by the driver.
    // We also load the owner so that we can verify ownership.
    const vehicle = await this.vehicleRepository.findOne({
      where: {
        id: createRideDto.vehicleId,
      },
      relations: ['owner'],
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // Make sure the selected vehicle actually belongs
    // to the authenticated driver.
    if (vehicle.owner.id !== userId) {
      throw new ForbiddenException('You can only use your own vehicle');
    }

    // A driver cannot make more seats available than
    // the actual capacity of the vehicle.
    if (createRideDto.availableSeats > vehicle.seats) {
      throw new BadRequestException(
        'Available seats cannot exceed vehicle capacity',
      );
    }

    // Create the ride using the information from the DTO.
    const ride = this.rideRepository.create({
      // Starting location.
      origin: createRideDto.origin,

      // Destination of the ride.
      destination: createRideDto.destination,

      // Convert the date received from the request
      // into a JavaScript Date object.
      departureDate: new Date(createRideDto.departureDate),

      // PostgreSQL TIME is represented as a string.
      // Example: "08:30".
      departureTime: createRideDto.departureTime,

      // The total number of seats comes from the vehicle.
      // We don't allow the client to invent this value.
      totalSeat: vehicle.seats,

      // Number of seats the driver makes available
      // to passengers.
      availableSeat: createRideDto.availableSeats,

      // Map the DTO field to the entity field.
      seatPerPrice: createRideDto.pricePerSeat,

      // The authenticated user becomes the driver.
      driver,

      // The selected vehicle is associated with the ride.
      vehicle,
    });

    // Save the ride in PostgreSQL and return the saved record.
    return this.rideRepository.save(ride);
  }
}
