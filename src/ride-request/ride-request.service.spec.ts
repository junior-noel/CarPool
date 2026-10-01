import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';
import { Ride, RideStatus } from '../rides/ride.entity.js';
import { User } from '../users/user.entity.js';
import { RideRequest, RideRequestStatus } from './ride-request.entity.js';
import { RideRequestService } from './ride-request.service.js';

const driverId = 'driver-id';
const requestId = 'request-id';
const rideId = 'ride-id';

// Create isolated repository mocks for each service test.
function createService(initialRequest: RideRequest | null = null) {
  const rideRequestRepository = {
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(async (value: RideRequest) => value),
  };
  const rideRepository = {
    findOne: vi.fn(),
    save: vi.fn(),
  };
  const bookingRepository = {
    create: vi.fn((value: Partial<Booking>) => value as Booking),
    save: vi.fn(async (value: Booking) => ({ ...value, id: 'booking-id' })),
  };
  const requestLockOptions: unknown[] = [];
  let committedRequest = initialRequest;
  let committedBookings: Booking[] = [];
  let transactionQueue = Promise.resolve();
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

        const workingState = {
          request: committedRequest ? { ...committedRequest } : null,
          bookings: [...committedBookings],
        };
        const transactionRideRequestRepository = {
          findOne: vi.fn(async (options?: { lock?: unknown }) => {
            if (options?.lock) {
              requestLockOptions.push(options.lock);
            }
            return workingState.request;
          }),
          save: vi.fn(async (value: RideRequest) => {
            await rideRequestRepository.save(value);
            workingState.request = value;
            return value;
          }),
        };
        const transactionRideRepository = {
          findOne: rideRepository.findOne,
        };
        const transactionBookingRepository = {
          create: bookingRepository.create,
          save: vi.fn(async (value: Booking) => {
            const savedBooking = await bookingRepository.save(value);
            workingState.bookings.push(savedBooking);
            return savedBooking;
          }),
        };
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === RideRequest) return transactionRideRequestRepository;
            if (entity === Ride) return transactionRideRepository;
            if (entity === Booking) return transactionBookingRepository;
            throw new Error('Unexpected transaction repository');
          },
        } as unknown as EntityManager;

        try {
          const result = await runInTransaction(manager);
          committedRequest = workingState.request;
          committedBookings = workingState.bookings;
          return result;
        } finally {
          releaseTransaction();
        }
      },
    ),
  };
  const service = new RideRequestService(
    rideRequestRepository as unknown as Repository<RideRequest>,
    rideRepository as unknown as Repository<Ride>,
    bookingRepository as unknown as Repository<Booking>,
    {} as never,
    dataSource as unknown as DataSource,
  );

  return {
    service,
    rideRequestRepository,
    rideRepository,
    bookingRepository,
    dataSource,
    requestLockOptions,
    getCommittedState: () => ({
      request: committedRequest,
      bookings: committedBookings,
    }),
  };
}

// Build a future scheduled ride with overridable eligibility fields.
function createRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: rideId,
    driver: {
      id: driverId,
      password: 'driver-hash',
      email: 'driver@example.com',
    } as User,
    status: RideStatus.SCHEDULED,
    departureDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    departureTime: '23:59:00',
    availableSeat: 3,
    seatPerPrice: 12,
    ...overrides,
  } as Ride;
}

// Build an open request with a passenger containing private fields for response checks.
function createRequest(overrides: Partial<RideRequest> = {}): RideRequest {
  return {
    id: requestId,
    origin: 'North Station',
    destination: 'Airport',
    departureDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    preferredTime: '09:00:00',
    seatsNeeded: 2,
    status: RideRequestStatus.OPEN,
    passenger: {
      id: 'passenger-id',
      firstName: 'Sam',
      email: 'passenger@example.com',
      phoneNumber: '+237677123456',
      password: 'passenger-hash',
    } as User,
    ride: createRide(),
    ...overrides,
  } as RideRequest;
}

describe('RideRequestService.acceptRequest', () => {
  it('accepts a linked request with a pending booking and unchanged ride seats', async () => {
    const ride = createRide();
    const rideRequest = createRequest({ ride });
    const mocks = createService(rideRequest);

    const result = await mocks.service.acceptRequest(driverId, requestId, {});

    expect(result).toEqual({
      bookingId: 'booking-id',
      status: BookingStatus.PENDING,
      rideId: ride.id,
      requestId: rideRequest.id,
      seats: rideRequest.seatsNeeded,
    });
    expect(mocks.bookingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        passenger: rideRequest.passenger,
        ride,
        seats: rideRequest.seatsNeeded,
        status: BookingStatus.PENDING,
      }),
    );
    expect(ride.availableSeat).toBe(3);
    expect(mocks.rideRepository.save).not.toHaveBeenCalled();
    expect(mocks.getCommittedState().request?.status).toBe(
      RideRequestStatus.ACCEPTED,
    );
    expect(mocks.getCommittedState().bookings).toHaveLength(1);
    expect(mocks.requestLockOptions).toEqual([{ mode: 'pessimistic_write' }]);
  });

  it('accepts an unlinked request using a ride selected by the driver', async () => {
    const ride = createRide();
    const rideRequest = createRequest({ ride: null });
    const transactionalMocks = createService(rideRequest);
    transactionalMocks.rideRepository.findOne.mockResolvedValue(ride);

    const result = await transactionalMocks.service.acceptRequest(
      driverId,
      requestId,
      {
        rideId: ride.id,
      },
    );

    expect(result).toMatchObject({
      rideId: ride.id,
      requestId,
      status: 'pending',
    });
    expect(transactionalMocks.getCommittedState().request?.ride).toBe(ride);
    expect(transactionalMocks.getCommittedState().request?.status).toBe(
      RideRequestStatus.ACCEPTED,
    );
    expect(transactionalMocks.getCommittedState().bookings).toHaveLength(1);
    expect(ride.availableSeat).toBe(3);
  });

  it('rolls back request state when booking creation fails', async () => {
    const rideRequest = createRequest();
    const mocks = createService(rideRequest);
    mocks.bookingRepository.save.mockRejectedValue(
      new Error('Booking persistence failed'),
    );

    await expect(
      mocks.service.acceptRequest(driverId, requestId, {}),
    ).rejects.toThrow('Booking persistence failed');

    expect(mocks.getCommittedState().request?.status).toBe(
      RideRequestStatus.OPEN,
    );
    expect(mocks.getCommittedState().bookings).toHaveLength(0);
  });

  it('rolls back the staged booking and unlinked ride association when request update fails', async () => {
    const rideRequest = createRequest({ ride: null });
    const ride = createRide();
    const mocks = createService(rideRequest);
    mocks.rideRepository.findOne.mockResolvedValue(ride);
    mocks.rideRequestRepository.save.mockRejectedValue(
      new Error('Ride request persistence failed'),
    );

    await expect(
      mocks.service.acceptRequest(driverId, requestId, { rideId: ride.id }),
    ).rejects.toThrow('Ride request persistence failed');

    expect(mocks.getCommittedState().request?.status).toBe(
      RideRequestStatus.OPEN,
    );
    expect(mocks.getCommittedState().request?.ride).toBeNull();
    expect(mocks.getCommittedState().bookings).toHaveLength(0);
  });

  it('allows only one of two concurrent acceptances to create a booking', async () => {
    const rideRequest = createRequest();
    const mocks = createService(rideRequest);

    const attempts = await Promise.allSettled([
      mocks.service.acceptRequest(driverId, requestId, {}),
      mocks.service.acceptRequest('second-driver-id', requestId, {}),
    ]);

    const successfulAttempts = attempts.filter(
      (attempt) => attempt.status === 'fulfilled',
    );
    const failedAttempts = attempts.filter(
      (attempt) => attempt.status === 'rejected',
    );

    expect(successfulAttempts).toHaveLength(1);
    expect(failedAttempts).toHaveLength(1);
    if (failedAttempts[0]?.status === 'rejected') {
      expect(failedAttempts[0].reason).toBeInstanceOf(ConflictException);
      expect(failedAttempts[0].reason.message).toContain(
        'current status is "accepted"',
      );
    }
    expect(mocks.getCommittedState().bookings).toHaveLength(1);
    expect(mocks.getCommittedState().request?.status).toBe(
      RideRequestStatus.ACCEPTED,
    );
    expect(mocks.requestLockOptions).toEqual([
      { mode: 'pessimistic_write' },
      { mode: 'pessimistic_write' },
    ]);
  });

  it('returns 404 when the request does not exist', async () => {
    const mocks = createService();

    await expect(
      mocks.service.acceptRequest(driverId, requestId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 409 when the request is already accepted', async () => {
    const mocks = createService(
      createRequest({ status: RideRequestStatus.ACCEPTED }),
    );

    await expect(
      mocks.service.acceptRequest(driverId, requestId, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 403 when the linked ride belongs to another driver', async () => {
    const ride = createRide({ driver: { id: 'other-driver-id' } as User });
    const mocks = createService(createRequest({ ride }));

    await expect(
      mocks.service.acceptRequest(driverId, requestId, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns 403 when a driver selects another driver's ride for an unlinked request", async () => {
    const rideRequest = createRequest({ ride: null });
    const ride = createRide({ driver: { id: 'other-driver-id' } as User });
    const mocks = createService(rideRequest);
    mocks.rideRepository.findOne.mockResolvedValue(ride);

    await expect(
      mocks.service.acceptRequest(driverId, requestId, { rideId: ride.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 400 when the selected ride is not scheduled', async () => {
    const ride = createRide({ status: RideStatus.CANCELLED });
    const mocks = createService(createRequest({ ride: null }));
    mocks.rideRepository.findOne.mockResolvedValue(ride);

    await expect(
      mocks.service.acceptRequest(driverId, requestId, { rideId: ride.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 400 when the selected ride departure is in the past', async () => {
    const ride = createRide({
      departureDate: new Date('2020-01-01T00:00:00.000Z'),
      departureTime: '09:00:00',
    });
    const mocks = createService(createRequest({ ride: null }));
    mocks.rideRepository.findOne.mockResolvedValue(ride);

    await expect(
      mocks.service.acceptRequest(driverId, requestId, { rideId: ride.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 400 when the selected ride has insufficient seats', async () => {
    const ride = createRide({ availableSeat: 1 });
    const mocks = createService(createRequest({ ride: null }));
    mocks.rideRepository.findOne.mockResolvedValue(ride);

    await expect(
      mocks.service.acceptRequest(driverId, requestId, { rideId: ride.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns only booking identifiers and details, without user data', async () => {
    const mocks = createService(createRequest());

    const result = await mocks.service.acceptRequest(driverId, requestId, {});

    expect(Object.keys(result)).toEqual([
      'bookingId',
      'status',
      'rideId',
      'requestId',
      'seats',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/password|email|phoneNumber/i);
  });
});

describe('RideRequestService.findOpenRequests', () => {
  it('includes unlinked and eligible linked requests with only safe passenger details', async () => {
    const mocks = createService();
    const unlinkedRequest = createRequest({
      id: 'unlinked-request',
      ride: null,
    });
    const linkedRequest = createRequest({
      id: 'linked-request',
      ride: createRide(),
    });
    const anotherDriversRequest = createRequest({
      id: 'other-driver-request',
      ride: createRide({ driver: { id: 'other-driver-id' } as User }),
    });
    const cancelledRideRequest = createRequest({
      id: 'cancelled-ride-request',
      ride: createRide({ status: RideStatus.CANCELLED }),
    });
    mocks.rideRequestRepository.find.mockResolvedValue([
      unlinkedRequest,
      linkedRequest,
      anotherDriversRequest,
      cancelledRideRequest,
    ]);

    const results = await mocks.service.findOpenRequests(driverId);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.id)).toEqual([
      'unlinked-request',
      'linked-request',
    ]);
    for (const result of results) {
      expect(result.passenger).toEqual({ firstName: 'Sam' });
      expect(JSON.stringify(result)).not.toMatch(/password|email|phoneNumber/i);
    }
    expect(results[0].rideId).toBeNull();
    expect(results[1].rideId).toBe(rideId);
  });
});
