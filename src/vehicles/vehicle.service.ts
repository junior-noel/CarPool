import {  CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Vehicle } from './vehicle.entity.js';
import { Ride, RideStatus } from '../rides/ride.entity.js';import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';import { UserService } from '../users/user.service.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { In, Repository } from 'typeorm';
@Injectable()
export class VehicleService {
  constructor(
    //repostory use to create and store vehcle
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
 // Repository used to check rides associated with a vehicle.
  @InjectRepository(Ride)
  private readonly rideRepository: Repository<Ride>,
  // Service used to retrieve the vehicle owner.
      private readonly userService: UserService,
  ) {}

  // Creates a new vehicle belonging to the authenticated user.
  async create(
    CreateVehicleDto: CreateVehicleDto,
      userId: string,
    
  ): Promise<Omit<Vehicle, 'owner'>> {
      // Find the user who is creating the vehicle.
      const owner = await this.userService.findById(userId)
      if (!owner) {
          throw new NotFoundException('User not found');
      }

    const vehicle = this.vehicleRepository.create({
      ...CreateVehicleDto, owner
    });

      const savedVehicle = await this.vehicleRepository.save(vehicle);
      const { owner: _, ...vehicleWithoutOwner } = savedVehicle;
      return vehicleWithoutOwner;
  }

  // Updates an existing vehicle belonging to the authenticated user.
async update(
  vehicleId: string,
  updateVehicleDto: UpdateVehicleDto,
  userId: string,
): Promise<Omit<Vehicle, 'owner'>> {
if (Object.keys(updateVehicleDto).length === 0) {
  throw new BadRequestException('Provide at least one field to update');
}

  // Find the vehicle and load its owner for authorization.
  const vehicle = await this.vehicleRepository.findOne({
    where: { id: vehicleId },
    relations: { owner: true },
  });

  // Stop if the requested vehicle does not exist.
  if (!vehicle) {
    throw new NotFoundException('Vehicle not found');
  }

  // Ensure that only the vehicle owner can modify it.
  if (vehicle.owner.id !== userId) {
    throw new ForbiddenException('You are not allowed to update this vehicle');
  }

  // Check whether the new license plate is already assigned to another vehicle.
  if (updateVehicleDto.licensePlate) {
    const existingVehicle = await this.vehicleRepository.findOne({
      where: { licensePlate: updateVehicleDto.licensePlate },
    });

    if (existingVehicle && existingVehicle.id !== vehicleId) {
      throw new ConflictException('This license plate is already registered');
    }
  }

  // Check capacity only when the driver is changing the number of seats.
  if (updateVehicleDto.seats !== undefined) {
    // Retrieve scheduled and ongoing rides assigned to this vehicle.
    const activeRides = await this.rideRepository.find({
      where: {
        vehicle: { id: vehicleId },
        status: In([RideStatus.SCHEDULED, RideStatus.ONGOING]),
      },
    });

    // Find the highest seat capacity required by those rides.
    const maximumRequiredSeats = activeRides.reduce(
      (maximum, ride) => Math.max(maximum, ride.totalSeat),
      0,
    );

    // Protect the capacity requirements of existing rides.
    if (updateVehicleDto.seats < maximumRequiredSeats) {
      throw new BadRequestException(
        `Vehicle capacity cannot be reduced below ${maximumRequiredSeats} seats because of an existing scheduled or ongoing ride`,
      );
    }
  }

  // Apply only the fields supplied in the update request.
  Object.assign(vehicle, updateVehicleDto);

  // Save the modified vehicle in the database.
  const updatedVehicle = await this.vehicleRepository.save(vehicle);

  // Exclude the owner relationship from the response.
  const { owner: _, ...vehicleWithoutOwner } = updatedVehicle;

  return vehicleWithoutOwner;
}

  // Deletes a vehicle only when the authenticated driver owns it and no ride
  // is associated with it. Ride history must not lose its vehicle reference.
  async delete(
    vehicleId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id: vehicleId },
      relations: { owner: true },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.owner.id !== userId) {
      throw new ForbiddenException('You are not allowed to delete this vehicle');
    }

    const associatedRideCount = await this.rideRepository.count({
      where: {
        vehicle: { id: vehicleId },
      },
    });

    if (associatedRideCount > 0) {
      throw new ConflictException(
        'This vehicle cannot be deleted because it is associated with one or more rides',
      );
    }

    await this.vehicleRepository.remove(vehicle);

    return { message: 'Vehicle deleted successfully' };
  }
}
