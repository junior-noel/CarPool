import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RideRequest } from './ride-request.entity.js';
import { CreateRideRequestDto } from './dto/create-ride-request.dto.js';
import { UserService } from '../users/user.service.js';
import { PassengerGuard } from '../passenger-application/guards/passenger.guard.js';

@Injectable()
export class RideRequestService {
  constructor(
  
    @InjectRepository(RideRequest)
    private readonly rideRequestRepository: Repository<RideRequest>,

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

     //Create the RideRequest entity.
    const rideRequest = this.rideRequestRepository.create({
      origin: createRideRequestDto.origin,
      destination: createRideRequestDto.destination,

      // Convert the date string received from the DTO into a JavaScript Date object.
      departureDate: new Date(createRideRequestDto.departureDate),

      preferredTime: createRideRequestDto.preferredTime,
      seatsNeeded: createRideRequestDto.seatsNeeded,
      passenger,

      // No driver has accepted the request yet.
      driver: null,
    });

    return this.rideRequestRepository.save(rideRequest);
  }
}
