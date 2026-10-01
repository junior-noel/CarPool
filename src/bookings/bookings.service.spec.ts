import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { Booking, BookingStatus } from './booking.entity.js';
import { Ride } from '../rides/ride.entity.js';
import { User } from '../users/user.entity.js';
import { BookingService } from './bookings.service.js';

const driverId = 'driver-id';
const rideId = 'ride-id';

// Build a ride with a mutable available-seat count for approval scenarios.
function createRide(availableSeat: number): Ride {
  return {
    id: rideId,
    availableSeat,
    driver: { id: driverId } as User,
  } as Ride;
}

// Build a pending booking with its ride relation and requested seat count.
function createBooking(
  id: string,
  ride: Ride,
  seats: number,
  status = BookingStatus.PENDING,
): Booking {
  return {
    id,
    seats,
    totalPrice: seats * 10,
    status,
    passenger: { id: `passenger-${id}`, password: 'hash' } as User,
    ride,
  } as Booking;
}

// Simulate serialized database transactions with private working state and rollback on rejection.
function createService(seedRide: Ride, seedBookings: Booking[]) {
  let committedRide = { ...seedRide };
  let committedBookings = seedBookings.map((booking) => ({
    ...booking,
    ride: committedRide,
  }));
  let transactionQueue = Promise.resolve();
  const rideSave = vi.fn(async (ride: Ride) => ride);
  const bookingSave = vi.fn(async (booking: Booking) => booking);
  const rideLockOptions: unknown[] = [];
  const bookingLockOptions: unknown[] = [];
  const dataSource = {
    transaction: vi.fn(
      async (runInTransaction: (manager: EntityManager) => Promise<unknown>) => {
        let releaseTransaction!: () => void;
        const previousTransaction = transactionQueue;
        transactionQueue = new Promise<void>((resolve) => {
          releaseTransaction = resolve;
        });
        await previousTransaction;

        const workingRide = { ...committedRide };
        const workingBookings = new Map(
          committedBookings.map((booking) => [
            booking.id,
            { ...booking, ride: workingRide },
          ]),
        );
        const bookingRepository = {
          findOne: vi.fn(async (options: { where: { id: string }; lock?: unknown }) => {
            if (options.lock) bookingLockOptions.push(options.lock);
            return workingBookings.get(options.where.id) ?? null;
          }),
          save: vi.fn(async (booking: Booking) => {
            const saved = await bookingSave(booking);
            workingBookings.set(saved.id, saved);
            return saved;
          }),
        };
        const rideRepository = {
          findOne: vi.fn(async (options: { lock?: unknown }) => {
            if (options.lock) rideLockOptions.push(options.lock);
            return workingRide;
          }),
          save: vi.fn(async (ride: Ride) => {
            await rideSave(ride);
            return ride;
          }),
        };
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Booking) return bookingRepository;
            if (entity === Ride) return rideRepository;
            throw new Error('Unexpected transaction repository');
          },
        } as unknown as EntityManager;

        try {
          const result = await runInTransaction(manager);
          committedRide = workingRide;
          committedBookings = [...workingBookings.values()];
          return result;
        } finally {
          releaseTransaction();
        }
      },
    ),
  };
  const service = new BookingService(
    {} as Repository<Booking>,
    {} as Repository<Ride>,
    {} as never,
    dataSource as unknown as DataSource,
  );

  return {
    service,
    rideSave,
    bookingSave,
    rideLockOptions,
    bookingLockOptions,
    getCommittedState: () => ({
      ride: committedRide,
      bookings: committedBookings,
    }),
  };
}

describe('BookingService.approveBooking', () => {
  it('commits one seat decrement and the approved booking together', async () => {
    const ride = createRide(2);
    const booking = createBooking('booking-1', ride, 1);
    const mocks = createService(ride, [booking]);

    const result = await mocks.service.approveBooking(driverId, booking.id);

    expect(result.status).toBe(BookingStatus.APPROVED);
    expect(mocks.getCommittedState().ride.availableSeat).toBe(1);
    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.APPROVED,
    );
    expect(mocks.rideSave).toHaveBeenCalledOnce();
    expect(mocks.bookingSave).toHaveBeenCalledOnce();
    expect(mocks.rideLockOptions).toEqual([{ mode: 'pessimistic_write' }]);
    expect(mocks.bookingLockOptions).toEqual([{ mode: 'pessimistic_write' }]);
  });

  it('does not change either record when seats are insufficient', async () => {
    const ride = createRide(1);
    const booking = createBooking('booking-2', ride, 2);
    const mocks = createService(ride, [booking]);

    await expect(
      mocks.service.approveBooking(driverId, booking.id),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mocks.getCommittedState().ride.availableSeat).toBe(1);
    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.PENDING,
    );
    expect(mocks.rideSave).not.toHaveBeenCalled();
    expect(mocks.bookingSave).not.toHaveBeenCalled();
  });

  it.each([BookingStatus.APPROVED, BookingStatus.REJECTED])(
    'rejects a booking already in %s without changing seats',
    async (status) => {
      const ride = createRide(2);
      const booking = createBooking(`booking-${status}`, ride, 1, status);
      const mocks = createService(ride, [booking]);

      await expect(
        mocks.service.approveBooking(driverId, booking.id),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mocks.getCommittedState().ride.availableSeat).toBe(2);
      expect(mocks.getCommittedState().bookings[0].status).toBe(status);
      expect(mocks.rideSave).not.toHaveBeenCalled();
      expect(mocks.bookingSave).not.toHaveBeenCalled();
    },
  );

  it('rolls the seat decrement back if saving the booking fails', async () => {
    const ride = createRide(2);
    const booking = createBooking('booking-save-failure', ride, 1);
    const mocks = createService(ride, [booking]);
    mocks.bookingSave.mockRejectedValue(new Error('Booking save failed'));

    await expect(
      mocks.service.approveBooking(driverId, booking.id),
    ).rejects.toThrow('Booking save failed');

    expect(mocks.getCommittedState().ride.availableSeat).toBe(2);
    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.PENDING,
    );
  });

  it('allows only one concurrent approval to claim the last seat', async () => {
    const ride = createRide(1);
    const firstBooking = createBooking('booking-first', ride, 1);
    const secondBooking = createBooking('booking-second', ride, 1);
    const mocks = createService(ride, [firstBooking, secondBooking]);

    const results = await Promise.allSettled([
      mocks.service.approveBooking(driverId, firstBooking.id),
      mocks.service.approveBooking(driverId, secondBooking.id),
    ]);

    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (failures[0]?.status === 'rejected') {
      expect(failures[0].reason).toBeInstanceOf(BadRequestException);
      expect(failures[0].reason.message).toContain('Not enough available seats');
    }
    expect(mocks.getCommittedState().ride.availableSeat).toBe(0);
    expect(
      mocks.getCommittedState().bookings.filter(
        (booking) => booking.status === BookingStatus.APPROVED,
      ),
    ).toHaveLength(1);
  });
});
