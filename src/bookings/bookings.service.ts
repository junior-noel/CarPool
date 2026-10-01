import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    private readonly dataSource: DataSource,
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
    userId: string,
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
  async findMyBookings(userId: string): Promise<any[]> {
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
  async findByRide(rideId: string): Promise<any[]> {
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
    driverId: string,
    rideId: string,
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
  async approveBooking(driverId: string, bookingId: string): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      // Lock the booking to serialize repeat approvals of the same record.
      const booking = await bookingRepository.findOne({
        where: { id: bookingId },
        relations: ['passenger', 'ride', 'ride.vehicle', 'ride.driver'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.status !== BookingStatus.PENDING) {
        throw new ConflictException(
          `Booking cannot be approved because its current status is "${booking.status}"`,
        );
      }

      if (booking.ride.driver.id !== driverId) {
        throw new ConflictException(
          'You can only approve bookings for your own rides',
        );
      }

      const rideRepository = manager.getRepository(Ride);
      // Lock the shared ride row so competing bookings see the latest seat count.
      const ride = await rideRepository.findOne({
        where: { id: booking.ride.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!ride) {
        throw new NotFoundException('Ride not found');
      }

      if (booking.seats > ride.availableSeat) {
        throw new BadRequestException(
          `Not enough available seats. Only ${ride.availableSeat} seat(s) remain`,
        );
      }

      ride.availableSeat -= booking.seats;
      booking.ride = ride;
      booking.status = BookingStatus.APPROVED;

      // Keep the seat decrement and booking status change in one transaction.
      await rideRepository.save(ride);
      await bookingRepository.save(booking);

      return {
        ...booking,
        passenger: this.sanitizeUser(booking.passenger),
        ride: {
          ...ride,
          driver: this.sanitizeUser(ride.driver),
        },
      };
    });
  }

  // Reject a pending booking while serializing state changes on its row.
  async rejectBooking(driverId: string, bookingId: string): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      // Lock before reading status so reject cannot race with approval or cancellation.
      const booking = await bookingRepository.findOne({
        where: { id: bookingId },
        relations: ['passenger', 'ride', 'ride.vehicle', 'ride.driver'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.status !== BookingStatus.PENDING) {
        throw new ConflictException(
          `Booking cannot be rejected because its current status is "${booking.status}"`,
        );
      }

      if (booking.ride.driver.id !== driverId) {
        throw new ConflictException(
          'You can only reject bookings for your own rides',
        );
      }

      booking.status = BookingStatus.REJECTED;
      await bookingRepository.save(booking);

      return {
        ...booking,
        passenger: this.sanitizeUser(booking.passenger),
        ride: {
          ...booking.ride,
          driver: this.sanitizeUser(booking.ride.driver),
        },
      };
    });
  }

  // Cancel a passenger's booking and restore seats atomically when it was approved.
  async cancelBooking(userId: string, bookingId: string): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      // Lock the booking first, matching approval's lock order.
      const booking = await bookingRepository.findOne({
        where: { id: bookingId },
        relations: ['passenger', 'ride', 'ride.vehicle', 'ride.driver'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.passenger.id !== userId) {
        throw new ConflictException('You can only cancel your own bookings');
      }

      if (
        booking.status === BookingStatus.REJECTED ||
        booking.status === BookingStatus.CANCELLED
      ) {
        throw new ConflictException(
          `Booking cannot be cancelled because its current status is "${booking.status}"`,
        );
      }

      let ride = booking.ride;
      if (booking.status === BookingStatus.APPROVED) {
        const rideRepository = manager.getRepository(Ride);
        // Lock the ride after the booking so approval and cancellation share lock order.
        const lockedRide = await rideRepository.findOne({
          where: { id: booking.ride.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!lockedRide) {
          throw new NotFoundException('Ride not found');
        }

        if (lockedRide.availableSeat + booking.seats > lockedRide.totalSeat) {
          throw new BadRequestException(
            'Cancelling this booking would exceed the ride capacity.',
          );
        }

        lockedRide.availableSeat += booking.seats;
        ride = lockedRide;
        booking.ride = lockedRide;
        await rideRepository.save(lockedRide);
      }

      booking.status = BookingStatus.CANCELLED;
      await bookingRepository.save(booking);

      return {
        ...booking,
        passenger: this.sanitizeUser(booking.passenger),
        ride: {
          ...ride,
          driver: this.sanitizeUser(ride.driver),
        },
      };
    });
  }
}
