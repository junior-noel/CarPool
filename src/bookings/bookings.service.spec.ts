import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { Booking, BookingStatus } from './booking.entity.js';
import { Ride } from '../rides/ride.entity.js';
import { User } from '../users/user.entity.js';
import { BookingService } from './bookings.service.js';

const driverId = 'driver-id';
const rideId = 'ride-id';

// Build a ride with capacity and mutable availability for seat scenarios.
function createRide(
  availableSeat: number,
  totalSeat = availableSeat + 1,
): Ride {
  return {
    id: rideId,
    availableSeat,
    totalSeat,
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
  const lockOrder: string[] = [];
  const dataSource = {
    transaction: vi.fn(
      async (
        runInTransaction: (manager: EntityManager) => Promise<unknown>,
      ) => {
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
          findOne: vi.fn(
            async (options: { where: { id: string }; lock?: unknown }) => {
              if (options.lock) {
                bookingLockOptions.push(options.lock);
                lockOrder.push('booking');
              }
              return workingBookings.get(options.where.id) ?? null;
            },
          ),
          save: vi.fn(async (booking: Booking) => {
            const saved = await bookingSave(booking);
            workingBookings.set(saved.id, saved);
            return saved;
          }),
        };
        const rideRepository = {
          findOne: vi.fn(async (options: { lock?: unknown }) => {
            if (options.lock) {
              rideLockOptions.push(options.lock);
              lockOrder.push('ride');
            }
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
    lockOrder,
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
      expect(failures[0].reason.message).toContain(
        'Not enough available seats',
      );
    }
    expect(mocks.getCommittedState().ride.availableSeat).toBe(0);
    expect(
      mocks
        .getCommittedState()
        .bookings.filter(
          (booking) => booking.status === BookingStatus.APPROVED,
        ),
    ).toHaveLength(1);
  });
});

describe('BookingService.rejectBooking', () => {
  it('rejects a pending booking without touching ride seats', async () => {
    const ride = createRide(2);
    const booking = createBooking('pending-to-reject', ride, 1);
    const mocks = createService(ride, [booking]);

    const result = await mocks.service.rejectBooking(driverId, booking.id);

    expect(result.status).toBe(BookingStatus.REJECTED);
    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.REJECTED,
    );
    expect(mocks.getCommittedState().ride.availableSeat).toBe(2);
    expect(mocks.bookingSave).toHaveBeenCalledOnce();
    expect(mocks.rideSave).not.toHaveBeenCalled();
    expect(mocks.lockOrder).toEqual(['booking']);
  });

  it.each([
    BookingStatus.APPROVED,
    BookingStatus.REJECTED,
    BookingStatus.CANCELLED,
  ])('does not change a booking already in %s', async (status) => {
    const ride = createRide(2);
    const booking = createBooking(`cannot-reject-${status}`, ride, 1, status);
    const mocks = createService(ride, [booking]);

    await expect(
      mocks.service.rejectBooking(driverId, booking.id),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mocks.getCommittedState().bookings[0].status).toBe(status);
    expect(mocks.getCommittedState().ride.availableSeat).toBe(2);
    expect(mocks.bookingSave).not.toHaveBeenCalled();
    expect(mocks.rideSave).not.toHaveBeenCalled();
    expect(mocks.lockOrder).toEqual(['booking']);
  });

  it('preserves the ride-driver ownership check', async () => {
    const ride = createRide(2);
    ride.driver = { id: 'another-driver-id' } as User;
    const booking = createBooking('other-drivers-booking', ride, 1);
    const mocks = createService(ride, [booking]);

    await expect(
      mocks.service.rejectBooking(driverId, booking.id),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.PENDING,
    );
    expect(mocks.getCommittedState().ride.availableSeat).toBe(2);
    expect(mocks.bookingSave).not.toHaveBeenCalled();
    expect(mocks.rideSave).not.toHaveBeenCalled();
  });

  it('rolls back rejection if saving the rejected booking fails', async () => {
    const ride = createRide(2);
    const booking = createBooking('reject-save-failure', ride, 1);
    const mocks = createService(ride, [booking]);
    mocks.bookingSave.mockRejectedValue(new Error('Booking save failed'));

    await expect(
      mocks.service.rejectBooking(driverId, booking.id),
    ).rejects.toThrow('Booking save failed');

    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.PENDING,
    );
    expect(mocks.getCommittedState().ride.availableSeat).toBe(2);
    expect(mocks.rideSave).not.toHaveBeenCalled();
  });

  it('allows exactly one of reject and approve to win for the same booking', async () => {
    const ride = createRide(1);
    const booking = createBooking('reject-approve-race', ride, 1);
    const mocks = createService(ride, [booking]);

    const results = await Promise.allSettled([
      mocks.service.rejectBooking(driverId, booking.id),
      mocks.service.approveBooking(driverId, booking.id),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failures = results.filter((result) => result.status === 'rejected');
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBeInstanceOf(ConflictException);

    const finalBooking = mocks.getCommittedState().bookings[0];
    expect([BookingStatus.REJECTED, BookingStatus.APPROVED]).toContain(
      finalBooking.status,
    );
    if (finalBooking.status === BookingStatus.REJECTED) {
      expect(mocks.getCommittedState().ride.availableSeat).toBe(1);
      expect(mocks.rideSave).not.toHaveBeenCalled();
    } else {
      expect(mocks.getCommittedState().ride.availableSeat).toBe(0);
      expect(mocks.rideSave).toHaveBeenCalledOnce();
    }
    expect(mocks.lockOrder[0]).toBe('booking');
    expect(mocks.lockOrder[1]).toBe('booking');
  });
});

describe('BookingService.cancelBooking', () => {
  it('restores seats once when cancelling an approved booking', async () => {
    const ride = createRide(1, 2);
    const booking = createBooking(
      'approved-to-cancel',
      ride,
      1,
      BookingStatus.APPROVED,
    );
    const mocks = createService(ride, [booking]);

    const result = await mocks.service.cancelBooking(
      booking.passenger.id,
      booking.id,
    );

    expect(result.status).toBe(BookingStatus.CANCELLED);
    expect(mocks.getCommittedState().ride.availableSeat).toBe(2);
    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.CANCELLED,
    );
    expect(mocks.rideSave).toHaveBeenCalledOnce();
    expect(mocks.bookingSave).toHaveBeenCalledOnce();
    expect(mocks.lockOrder).toEqual(['booking', 'ride']);
  });

  it('does not change seats when cancelling a pending booking', async () => {
    const ride = createRide(1, 2);
    const booking = createBooking('pending-to-cancel', ride, 1);
    const mocks = createService(ride, [booking]);

    await mocks.service.cancelBooking(
      'passenger-pending-to-cancel',
      booking.id,
    );

    expect(mocks.getCommittedState().ride.availableSeat).toBe(1);
    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.CANCELLED,
    );
    expect(mocks.rideSave).not.toHaveBeenCalled();
    expect(mocks.lockOrder).toEqual(['booking']);
  });

  it('rejects an already-cancelled booking without restoring seats', async () => {
    const ride = createRide(1, 2);
    const booking = createBooking(
      'already-cancelled',
      ride,
      1,
      BookingStatus.CANCELLED,
    );
    const mocks = createService(ride, [booking]);

    await expect(
      mocks.service.cancelBooking('passenger-already-cancelled', booking.id),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mocks.getCommittedState().ride.availableSeat).toBe(1);
    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.CANCELLED,
    );
    expect(mocks.rideSave).not.toHaveBeenCalled();
    expect(mocks.bookingSave).not.toHaveBeenCalled();
  });

  it('allows only one concurrent cancellation to restore seats', async () => {
    const ride = createRide(1, 2);
    const booking = createBooking(
      'double-cancel',
      ride,
      1,
      BookingStatus.APPROVED,
    );
    const mocks = createService(ride, [booking]);

    const results = await Promise.allSettled([
      mocks.service.cancelBooking('passenger-double-cancel', booking.id),
      mocks.service.cancelBooking('passenger-double-cancel', booking.id),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failures = results.filter((result) => result.status === 'rejected');
    expect(failures).toHaveLength(1);
    if (failures[0]?.status === 'rejected') {
      expect(failures[0].reason).toBeInstanceOf(ConflictException);
      expect(failures[0].reason.message).toContain('cancelled');
    }
    expect(mocks.getCommittedState().ride.availableSeat).toBe(2);
    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.CANCELLED,
    );
    expect(mocks.rideSave).toHaveBeenCalledOnce();
  });

  it('rolls back seat restoration if saving the cancelled booking fails', async () => {
    const ride = createRide(1, 2);
    const booking = createBooking(
      'cancel-save-failure',
      ride,
      1,
      BookingStatus.APPROVED,
    );
    const mocks = createService(ride, [booking]);
    mocks.bookingSave.mockRejectedValue(new Error('Booking save failed'));

    await expect(
      mocks.service.cancelBooking('passenger-cancel-save-failure', booking.id),
    ).rejects.toThrow('Booking save failed');

    expect(mocks.getCommittedState().ride.availableSeat).toBe(1);
    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.APPROVED,
    );
  });

  it.each(['cancel-first', 'approve-first'])(
    'keeps seats consistent when cancellation races approval (%s)',
    async (order) => {
      const ride = createRide(0, 1);
      const approvedBooking = createBooking(
        'existing-approved',
        ride,
        1,
        BookingStatus.APPROVED,
      );
      const pendingBooking = createBooking('competing-pending', ride, 1);
      const mocks = createService(ride, [approvedBooking, pendingBooking]);

      const cancellation = () =>
        mocks.service.cancelBooking(
          'passenger-existing-approved',
          approvedBooking.id,
        );
      const approval = () =>
        mocks.service.approveBooking(driverId, pendingBooking.id);
      const results =
        order === 'cancel-first'
          ? await Promise.allSettled([cancellation(), approval()])
          : await Promise.allSettled([approval(), cancellation()]);

      const state = mocks.getCommittedState();
      expect(
        state.bookings.find((item) => item.id === approvedBooking.id)?.status,
      ).toBe(BookingStatus.CANCELLED);
      expect(state.ride.availableSeat).toBeGreaterThanOrEqual(0);
      expect(state.ride.availableSeat).toBeLessThanOrEqual(
        state.ride.totalSeat,
      );
      expect(mocks.lockOrder).toEqual([
        'booking',
        ...(order === 'cancel-first'
          ? ['ride', 'booking', 'ride']
          : ['ride', 'booking', 'ride']),
      ]);

      const approvalResult = order === 'cancel-first' ? results[1] : results[0];
      if (order === 'cancel-first') {
        expect(approvalResult.status).toBe('fulfilled');
        expect(
          state.bookings.find((item) => item.id === pendingBooking.id)?.status,
        ).toBe(BookingStatus.APPROVED);
        expect(state.ride.availableSeat).toBe(0);
      } else {
        expect(approvalResult.status).toBe('rejected');
        expect(
          state.bookings.find((item) => item.id === pendingBooking.id)?.status,
        ).toBe(BookingStatus.PENDING);
        expect(state.ride.availableSeat).toBe(1);
      }
    },
  );

  it('refuses seat restoration that would exceed total ride capacity', async () => {
    const ride = createRide(2, 2);
    const booking = createBooking(
      'over-capacity-restore',
      ride,
      1,
      BookingStatus.APPROVED,
    );
    const mocks = createService(ride, [booking]);

    await expect(
      mocks.service.cancelBooking(
        'passenger-over-capacity-restore',
        booking.id,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mocks.getCommittedState().ride.availableSeat).toBe(2);
    expect(mocks.getCommittedState().bookings[0].status).toBe(
      BookingStatus.APPROVED,
    );
    expect(mocks.rideSave).not.toHaveBeenCalled();
    expect(mocks.bookingSave).not.toHaveBeenCalled();
  });
});
