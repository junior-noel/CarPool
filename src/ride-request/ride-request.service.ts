import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RideRequest, RideRequestStatus } from './ride-request.entity.js';
import { CreateRideRequestDto } from './dto/create-ride-request.dto.js';
import { UserService } from '../users/user.service.js';
import { Ride } from '../rides/ride.entity.js';

@Injectable()
export class RideRequestService {
  constructor(
    @InjectRepository(RideRequest)
    private readonly rideRequestRepository: Repository<RideRequest>,

    //This allows the service to find the ride when a passenger sends a rideId.
    @InjectRepository(Ride)
    private readonly rideRepository: Repository<Ride>,

    //  UserService allows us to find the authenticated passenger using the ID obtained from the JWT.
    private readonly userService: UserService,
  ) {}

  //Creates a new ride request for a passenger.
  async create(
    userId: number,
    createRideRequestDto: CreateRideRequestDto,
  ): Promise<RideRequest> {
    // Find the user who is making the request.
    const passenger = await this.userService.findById(userId);

    if (!passenger) {
      throw new NotFoundException('User not found');
    }

// A RideRequest may optionally be linked to an existing Ride.
// If rideId is provided, the passenger wants to requesta seat on that specific ride.
// If rideId is not provided, this is a general request looking for a suitable driver/ride.
let ride: Ride | null = null;

if (createRideRequestDto.rideId) {
  ride = await this.rideRepository.findOne({
    where: {
      id: createRideRequestDto.rideId,
    },
  });

  // The passenger cannot request a ride that does not exist.
  if (!ride) {
    throw new NotFoundException('Ride not found');
  }
}

// Create the RideRequest.
const rideRequest = this.rideRequestRepository.create({
  origin: createRideRequestDto.origin,
  destination: createRideRequestDto.destination,
  departureDate: new Date(
    createRideRequestDto.departureDate,
  ),
  preferredTime: createRideRequestDto.preferredTime,
  seatsNeeded: createRideRequestDto.seatsNeeded,
  passenger,
  ride,
});

return this.rideRequestRepository.save(rideRequest);

  }

  //Return all rdeRequest stll waitng for a drver
  async findOpenRequests(): Promise<RideRequest[]> {
    return this.rideRequestRepository.find({
      where: {
        status: RideRequestStatus.OPEN,
      },
      relations: ['passenger'],
      order: {
        createdAt: 'DESC',
      },
    });
  }
}
