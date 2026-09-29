import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RideRequest, RideRequestStatus } from './ride-request.entity.js';
import { CreateRideRequestDto } from './dto/create-ride-request.dto.js';
import { UserService } from '../users/user.service.js';
import { Ride } from '../rides/ride.entity.js';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';

@Injectable()
export class RideRequestService {
  constructor(
    @InjectRepository(RideRequest)
    private readonly rideRequestRepository: Repository<RideRequest>,

    //This allows the service to find the ride when a passenger sends a rideId.
    @InjectRepository(Ride)
    private readonly rideRepository: Repository<Ride>,

    // This repository allows us to automatically create a Booking when a driver accepts a RideRequest.
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,

    //  UserService allows us to find the authenticated passenger using the ID obtained from the JWT.
    private readonly userService: UserService,
  ) {}

  // Remove sensitive information before returning a user in an API response
  private sanitizeUser(user: any) {
    if (!user) {
      return user;
    }
    // Extract the password and keep everything else
    const { password, ...safeUser } = user;

    return safeUser;
  }

  //Creates a new ride request for a passenger.
  async create(
    userId: string,
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
      departureDate: new Date(createRideRequestDto.departureDate),
      preferredTime: createRideRequestDto.preferredTime,
      seatsNeeded: createRideRequestDto.seatsNeeded,
      passenger,
      ride,
    });

    return this.rideRequestRepository.save(rideRequest);
  }

  // Return all ride requests still waiting for a driver
  async findOpenRequests(): Promise<any[]> {
    const requests = await this.rideRequestRepository.find({
      where: {
        status: RideRequestStatus.OPEN,
      },
      relations: ['passenger'],
      order: {
        createdAt: 'DESC',
      },
    });

    return requests.map((request) => ({
      ...request,
      passenger: this.sanitizeUser(request.passenger),
    }));
  }

  // Allows an approved driver to accept a RideRequest. The Booking is attached to the existing Ride.
  async acceptRequest(driverId: string, rideRequestId: string): Promise<any> {
    // Find the RideRequest using its ID.
    // We also load the passenger and the Ride with its driver.
    const rideRequest = await this.rideRequestRepository.findOne({
      where: {
        id: rideRequestId,
      },
      relations: ['passenger', 'ride', 'ride.driver'],
    });

    // Make sure the RideRequest exists.
    if (!rideRequest) {
      throw new NotFoundException('Ride request not found');
    }

    // Only OPEN requests can be accepted.
    if (rideRequest.status !== RideRequestStatus.OPEN) {
      throw new ConflictException(
        `Ride request cannot be accepted because its current status is "${rideRequest.status}"`,
      );
    }

    // A general RideRequest without an associated Ride
    // cannot automatically create a Booking yet.
    if (!rideRequest.ride) {
      throw new ConflictException(
        'This ride request is not associated with a ride yet',
      );
    }

    // Make sure the logged-in driver owns the Ride
    // attached to this RideRequest.
    if (rideRequest.ride.driver.id !== driverId) {
      throw new ForbiddenException(
        'You can only accept ride requests for your own rides',
      );
    }

    // Make sure the Ride has enough available seats.
    if (rideRequest.seatsNeeded > rideRequest.ride.availableSeat) {
      throw new ConflictException(
        `The ride does not have enough available seats. Available seats: ${rideRequest.ride.availableSeat}`,
      );
    }

    // Calculate the total booking price.
    const totalPrice = rideRequest.seatsNeeded * Number(rideRequest.ride.seatPerPrice);

    // Automatically create a Booking for the passenger
    // using the driver's existing Ride.
    const booking = this.bookingRepository.create({
      passenger: rideRequest.passenger,
      ride: rideRequest.ride,
      seats: rideRequest.seatsNeeded,
      totalPrice,
      status: BookingStatus.PENDING,
    });

    // Save the new Booking.
    const savedBooking = await this.bookingRepository.save(booking);

    // Mark the RideRequest as accepted.
    rideRequest.status = RideRequestStatus.ACCEPTED;

    // Save the updated RideRequest.
    await this.rideRequestRepository.save(rideRequest);

    // Return the accepted request and the newly-created Booking.
    return {
      message: 'Ride request accepted and booking created successfully',

      rideRequest: {
        ...rideRequest,
        passenger: this.sanitizeUser(rideRequest.passenger),
      },

      booking: savedBooking,
    };
  }
}



  
