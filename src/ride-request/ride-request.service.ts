import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RideRequest, RideRequestStatus } from './ride-request.entity.js';
import { CreateRideRequestDto } from './dto/create-ride-request.dto.js';
import { AcceptRideRequestDto } from './dto/accept-ride-request.dto.js';
import { UserService } from '../users/user.service.js';
import { Ride, RideStatus } from '../rides/ride.entity.js';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';

// Fields drivers may see for open requests.
export interface OpenRideRequestResponse {
  id: string;
  origin: string;
  destination: string;
  departureDate: Date;
  preferredTime: string;
  seatsNeeded: number;
  status: RideRequestStatus;
  rideId: string | null;
  passenger: { firstName: string };
}

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
    private readonly dataSource: DataSource,
  ) {}

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

  // Return unlinked requests and linked requests eligible for this driver.
  async findOpenRequests(driverId: string): Promise<OpenRideRequestResponse[]> {
    const requests = await this.rideRequestRepository.find({
      where: {
        status: RideRequestStatus.OPEN,
      },
      relations: ['passenger', 'ride', 'ride.driver'],
      order: {
        createdAt: 'DESC',
      },
    });

    return requests
      .filter(
        (request) =>
          !request.ride ||
          this.isRideEligibleForDriver(
            request.ride,
            driverId,
            request.seatsNeeded,
          ),
      )
      .map((request) => this.toSafeRequestResponse(request));
  }

  // Check the driver, scheduled state, future departure, and requested seat count.
  private isRideEligibleForDriver(
    ride: Ride,
    driverId: string,
    seatsNeeded: number,
  ): boolean {
    return (
      ride.driver.id === driverId &&
      ride.status === RideStatus.SCHEDULED &&
      this.getDepartureTimestamp(ride) > Date.now() &&
      ride.availableSeat >= seatsNeeded
    );
  }

  // Convert a database date/time pair into a comparable local departure timestamp.
  private getDepartureTimestamp(ride: Ride): number {
    const rawDepartureDate = ride.departureDate as Date | string;
    const departureDate =
      typeof rawDepartureDate === 'string'
        ? rawDepartureDate
        : rawDepartureDate.toISOString().slice(0, 10);

    return new Date(`${departureDate}T${ride.departureTime}`).getTime();
  }

  // Expose request details and passenger first name without contact or credential fields.
  private toSafeRequestResponse(request: RideRequest) {
    return {
      id: request.id,
      origin: request.origin,
      destination: request.destination,
      departureDate: request.departureDate,
      preferredTime: request.preferredTime,
      seatsNeeded: request.seatsNeeded,
      status: request.status,
      rideId: request.ride?.id ?? null,
      passenger: {
        firstName: request.passenger.firstName,
      },
    };
  }

  // Accept under a request-row lock so only one transaction can create its booking.
  async acceptRequest(
    driverId: string,
    rideRequestId: string,
    acceptDto: AcceptRideRequestDto,
  ): Promise<object> {
    return this.dataSource.transaction(async (manager) => {
      const rideRequestRepository = manager.getRepository(RideRequest);

      // Lock the request row before checking status; competing acceptors wait for this transaction.
      const lockedRequest = await rideRequestRepository.findOne({
        where: { id: rideRequestId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedRequest) {
        throw new NotFoundException('Ride request not found');
      }

      if (lockedRequest.status !== RideRequestStatus.OPEN) {
        throw new ConflictException(
          `Ride request cannot be accepted because its current status is "${lockedRequest.status}"`,
        );
      }

      const rideRequest = await rideRequestRepository.findOne({
        where: { id: rideRequestId },
        relations: ['passenger', 'ride', 'ride.driver'],
      });

      if (!rideRequest) {
        throw new NotFoundException('Ride request not found');
      }

      // Recheck after loading relations while the request row remains locked.
      if (rideRequest.status !== RideRequestStatus.OPEN) {
        throw new ConflictException(
          `Ride request cannot be accepted because its current status is "${rideRequest.status}"`,
        );
      }

      const rideRepository = manager.getRepository(Ride);
      let ride = rideRequest.ride;

      if (!ride) {
        if (!acceptDto.rideId) {
          throw new BadRequestException(
            'A rideId is required for an unlinked ride request.',
          );
        }

        ride = await rideRepository.findOne({
          where: { id: acceptDto.rideId },
          relations: ['driver'],
        });

        if (!ride) {
          throw new NotFoundException('Ride not found');
        }
      }

      if (ride.driver.id !== driverId) {
        throw new ForbiddenException(
          'You can only accept requests for your own rides.',
        );
      }

      if (ride.status !== RideStatus.SCHEDULED) {
        throw new BadRequestException('The selected ride is not open.');
      }

      if (this.getDepartureTimestamp(ride) <= Date.now()) {
        throw new BadRequestException('The selected ride is in the past.');
      }

      if (rideRequest.seatsNeeded > ride.availableSeat) {
        throw new BadRequestException(
          'The selected ride does not have enough available seats.',
        );
      }

      const totalPrice = rideRequest.seatsNeeded * Number(ride.seatPerPrice);
      const bookingRepository = manager.getRepository(Booking);
      const booking = bookingRepository.create({
        passenger: rideRequest.passenger,
        ride,
        seats: rideRequest.seatsNeeded,
        totalPrice,
        status: BookingStatus.PENDING,
      });
      const savedBooking = await bookingRepository.save(booking);

      // Keep the ride association, booking, and accepted state in this transaction.
      rideRequest.ride = ride;
      rideRequest.status = RideRequestStatus.ACCEPTED;
      await rideRequestRepository.save(rideRequest);

      return {
        bookingId: savedBooking.id,
        status: savedBooking.status,
        rideId: ride.id,
        requestId: rideRequest.id,
        seats: savedBooking.seats,
      };
    });
  }
}
