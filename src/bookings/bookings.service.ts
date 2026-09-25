import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Booking, BookingStatus } from './booking.entity.js';

import { CreateBookingDto } from './dto/create-booking.dto.js';

import { UserService } from '../users/user.service.js';

import { Ride } from '../rides/ride.entity.js';

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,

    @InjectRepository(Ride)
    private readonly rideRepository: Repository<Ride>,

    private readonly userService: UserService,
  ) {}

  /**
   * Removes sensitive information from a User object
   * before it is returned through the API.
   *
   * Password hashes must never be exposed to the client.
   */
  private sanitizeUser(user: any) {
    if (!user) {
      return user;
    }

    const { password, ...safeUser } = user;

    return safeUser;
  }

  //Create a new booking for an existing ride.
  async create(
    userId: number,
    createBookingDto: CreateBookingDto,
  ): Promise<any> {
    // Find the authenticated user creating the booking.
    const passenger = await this.userService.findById(userId);

    if (!passenger) {
      throw new NotFoundException('User not found');
    }

    // Find the ride together with the vehicle and driver.
    const ride = await this.rideRepository.findOne({
      where: {
        id: createBookingDto.rideId,
      },
      relations: ['vehicle', 'driver'],
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    // Make sure the requested number of seats is valid
    // according to the ride's currently available seats.
    if (createBookingDto.seats > ride.availableSeat) {
      throw new BadRequestException(
        `Only ${ride.availableSeat} seat(s) are available`,
      );
    }

    // A driver cannot book their own ride.
    if (ride.driver.id === userId) {
      throw new ConflictException('You cannot book your own ride');
    }

    // Calculate the total booking price.
    const totalPrice = Number(ride.seatPerPrice) * createBookingDto.seats;

    // Create the booking.
    const booking = this.bookingRepository.create({
      seats: createBookingDto.seats,
      totalPrice,
      status: BookingStatus.PENDING,
      passenger,
      ride,
    });

    // Save the booking in the database.
    const savedBooking = await this.bookingRepository.save(booking);

    // Reload the booking with all required relationships. This gives us a complete object to return to the client.
    const createdBooking = await this.bookingRepository.findOne({
      where: {
        id: savedBooking.id,
      },

      relations: ['passenger', 'ride', 'ride.vehicle', 'ride.driver'],
    });

    if (!createdBooking) {
      throw new NotFoundException(
        'Booking could not be retrieved after creation',
      );
    }

    // Return the booking without exposing password hashes.
    return {
      ...createdBooking,

      passenger: this.sanitizeUser(createdBooking.passenger),

      ride: {
        ...createdBooking.ride,

        driver: this.sanitizeUser(createdBooking.ride.driver),
      },
    };
  }

  //Get all bookings created by the authenticated passenger.
  async findMyBookings(userId: number): Promise<any[]> {
    const bookings = await this.bookingRepository.find({
      where: {
        passenger: {
          id: userId,
        },
      },

      relations: ['passenger', 'ride', 'ride.vehicle', 'ride.driver'],

      order: {
        createdAt: 'DESC',
      },
    });

    // Remove password hashes from the passenger mand driver objects before returning the data.
    return bookings.map((booking) => ({
      ...booking,

      passenger: this.sanitizeUser(booking.passenger),

      ride: {
        ...booking.ride,
        driver: this.sanitizeUser(booking.ride.driver),
      },
    }));
  }

  // Get all bookings belonging to a particular ride
  async findByRide(rideId: number): Promise<any[]> {
    const bookings = await this.bookingRepository.find({
      where: {
        ride: {
          id: rideId,
        },
      },
      relations: ['passenger', 'ride'],
      order: {
        createdAt: 'DESC',
      },
    });

    //  Remove sensitive password information from every passenger.
    return bookings.map((booking) => ({
      ...booking,
      passenger: this.sanitizeUser(booking.passenger),
    }));
  }

  /**
   * Get bookings for a ride owned by the authenticated driver.
   *
   * Security rule:
   * A driver can only view bookings belonging to
   * their own ride.
   */
  async findBookingsForDriver(
    driverId: number,
    rideId: number,
  ): Promise<any[]> {
    // First find the ride and its driver.
    const ride = await this.rideRepository.findOne({
      where: {
        id: rideId,
      },
      relations: ['driver'],
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    // Make sure the authenticated driver actually owns this ride.
    if (ride.driver.id !== driverId) {
      throw new ConflictException(
        'You can only view bookings for your own rides',
      );
    }

    // Get all bookings belonging to this ride.
    const bookings = await this.bookingRepository.find({
      where: {
        ride: {
          id: rideId,
        },
      },

      relations: ['passenger', 'ride', 'ride.vehicle', 'ride.driver'],

      order: {
        createdAt: 'DESC',
      },
    });

    // Remove sensitive password information.
    return bookings.map((booking) => ({
      ...booking,

      passenger: this.sanitizeUser(booking.passenger),

      ride: {
        ...booking.ride,

        driver: this.sanitizeUser(booking.ride.driver),
      },
    }));
  }

  //  Approve a pending booking.
  async approveBooking(driverId: number, bookingId: number): Promise<any> {
    // Find the booking together with its ride and driver.
    const booking = await this.bookingRepository.findOne({
      where: {
        id: bookingId,
      },
      relations: ['passenger', 'ride', 'ride.vehicle', 'ride.driver'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Only pending bookings can be approved.
    if (booking.status !== BookingStatus.PENDING) {
      throw new ConflictException(
        `Booking cannot be approved because its current status is "${booking.status}"`,
      );
    }

    // Make sure the authenticated driver owns the ride.
    if (booking.ride.driver.id !== driverId) {
      throw new ConflictException(
        'You can only approve bookings for your own rides',
      );
    }

    // Re-check the available seats.
    //
    // This is important because another booking may have been
    // approved after this booking was originally created.
    if (booking.seats > booking.ride.availableSeat) {
      throw new BadRequestException(
        `Not enough available seats. Only ${booking.ride.availableSeat} seat(s) remain`,
      );
    }

    // Reduce the available seats.
    booking.ride.availableSeat -= booking.seats;

    // Change the booking status.
    booking.status = BookingStatus.APPROVED;

    // Save both changes.
    await this.rideRepository.save(booking.ride);
    await this.bookingRepository.save(booking);

    // Remove sensitive information before returning the result.
    return {
      ...booking,
      passenger: this.sanitizeUser(booking.passenger),

      ride: {
        ...booking.ride,
        driver: this.sanitizeUser(booking.ride.driver),
      },
    };
  }
}
