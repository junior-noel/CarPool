import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import { Travel, TravelStatus } from './travel.entity.js';
import { TravelService } from './travel.service.js';
import { departureTimestampMs } from '../common/time/time.util.js';
import { Ride, RideStatus } from '../rides/ride.entity.js';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';
import { User } from '../users/user.entity.js';
import {
  RideRequest,
  RideRequestStatus,
} from '../ride-request/ride-request.entity.js';
import { BookingService } from '../bookings/bookings.service.js';

const driverId = 'driver-1';
const rideId = 'ride-1';

// A scheduled ride departing 2026-10-15 12:00 in APP_TIMEZONE (Africa/Douala =
// UTC+1, no DST), i.e. 11:00:00Z. Window defaults: 30 min before, 120 after.
function makeRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: rideId,
    origin: 'Yaounde',
    destination: 'Douala',
    departureDate: '2026-10-15',
    departureTime: '12:00:00',
    status: RideStatus.SCHEDULED,
    totalSeat: 5,
    availableSeat: 3,
    driver: { id: driverId, password: 'hash' } as User,
    ...overrides,
  } as Ride;
}

// A booking on the default ride; status/links overridable.
function makeBooking(id: string, overrides: Partial<Booking> = {}): Booking {
  return {
    id,
    seats: 1,
    totalPrice: 10,
    status: BookingStatus.PENDING,
    passenger: { id: `passenger-${id}`, password: 'hash' } as User,
    ride: { id: rideId } as Ride,
    rideRequest: null,
    ...overrides,
  } as Booking;
}

function makeRequest(id: string, overrides: Partial<RideRequest> = {}): RideRequest {
  return {
    id,
    status: RideRequestStatus.ACCEPTED,
    ride: { id: rideId } as Ride,
    ...overrides,
  } as RideRequest;
}

// Build a TravelService over a fake DataSource that serializes transactions and
// records lock order, mirroring the bookings/ride-request spec harness.
function createService(
  seedRide: Ride,
  seedBookings: Booking[],
  seedRequests: RideRequest[] = [],
  seedTravels: Travel[] = [],
  config: { timezone?: string; before?: string; after?: string } = {},
) {
  const bookingService = new BookingService(
    {} as Repository<Booking>,
    {} as Repository<Ride>,
    {} as never,
    {} as DataSource,
  );

  let committedRide: Ride = { ...seedRide };
  let committedRequests = seedRequests.map((request) => ({ ...request }));
  let committedBookings = seedBookings.map((booking) => ({ ...booking }));
  let committedTravels = seedTravels.map((travel) => ({ ...travel }));

  let transactionQueue = Promise.resolve();
  const rideSave = vi.fn(async (ride: Ride) => ride);
  const bookingSave = vi.fn(async (booking: Booking) => booking);
  const requestSave = vi.fn(async (request: RideRequest) => request);
  const travelSave = vi.fn(async (travel: Travel) => travel);
  const rideLockOptions: unknown[] = [];
  const bookingLockOptions: unknown[] = [];
  const requestLockOptions: unknown[] = [];
  const lockOrder: string[] = [];
  const lockQueries = { bookings: [] as unknown[], ride: [] as unknown[] };

  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'APP_TIMEZONE') return config.timezone ?? 'Africa/Douala';
      if (key === 'TRAVEL_START_WINDOW_BEFORE_MINUTES')
        return config.before ?? '30';
      if (key === 'TRAVEL_START_WINDOW_AFTER_MINUTES')
        return config.after ?? '120';
      return undefined;
    }),
  } as unknown as ConfigService;

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

        const workingRide: Ride = { ...committedRide };
        const workingRequests = new Map(
          committedRequests.map((request) => [request.id, { ...request }]),
        );
        const workingBookings = new Map(
          committedBookings.map((booking) => [booking.id, { ...booking }]),
        );
        const workingTravels = [...committedTravels];

        const bookingRepository = {
          find: vi.fn(async (options: Record<string, unknown>) => {
            if (!options?.lock) {
              return [];
            }
            bookingLockOptions.push(options.lock);
            lockQueries.bookings.push(options);
            const where = options.where as {
              ride: { id: string };
              status: BookingStatus;
            };
            const rows = [...workingBookings.values()]
              .filter(
                (booking) =>
                  booking.ride?.id === where.ride.id &&
                  booking.status === where.status,
              )
              .sort((a, b) => a.id.localeCompare(b.id));
            rows.forEach(() => lockOrder.push('booking'));
            return rows;
          }),
          findOne: vi.fn(async (options: Record<string, unknown>) => {
            const where = options.where as { id: string };
            const booking = workingBookings.get(where.id);
            if (!booking) {
              return null;
            }
            return {
              ...booking,
              rideRequest: booking.rideRequest
                ? (workingRequests.get(booking.rideRequest.id) ?? null)
                : null,
            };
          }),
          save: vi.fn(async (booking: Booking) => {
            const saved = await bookingSave(booking);
            workingBookings.set(saved.id, saved);
            return saved;
          }),
          count: vi.fn(
            async (options: {
              where: {
                rideRequest: { id: string };
                id: { value: string };
                status: { value: BookingStatus[] };
              };
            }) => {
              const { rideRequest, id, status } = options.where;
              return [...workingBookings.values()].filter(
                (booking) =>
                  booking.rideRequest?.id === rideRequest.id &&
                  booking.id !== id.value &&
                  status.value.includes(booking.status),
              ).length;
            },
          ),
        };

        const requestRepository = {
          findOne: vi.fn(async (options: Record<string, unknown>) => {
            if (options?.lock) {
              requestLockOptions.push(options.lock);
              lockOrder.push('request');
            }
            const where = options.where as { id: string };
            return workingRequests.get(where.id) ?? null;
          }),
          save: vi.fn(async (request: RideRequest) => {
            const saved = await requestSave(request);
            workingRequests.set(saved.id, saved);
            return saved;
          }),
        };

        const rideRepository = {
          findOne: vi.fn(async (options: Record<string, unknown>) => {
            if (options?.lock) {
              rideLockOptions.push(options.lock);
              lockQueries.ride.push(options);
              lockOrder.push('ride');
            }
            return workingRide;
          }),
          save: vi.fn(async (ride: Ride) => {
            await rideSave(ride);
            return ride;
          }),
        };

        const travelRepository = {
          findOne: vi.fn(async (options: Record<string, unknown>) => {
            const where = options.where as { ride: { id: string } };
            return (
              workingTravels.find((travel) => travel.ride?.id === where.ride.id) ??
              null
            );
          }),
          create: vi.fn((data: object) => ({ ...data, id: 'new-travel-id' })),
          save: vi.fn(async (travel: Travel) => {
            const saved = await travelSave(travel);
            workingTravels.push(saved);
            return saved;
          }),
        };

        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Booking) return bookingRepository;
            if (entity === Ride) return rideRepository;
            if (entity === RideRequest) return requestRepository;
            if (entity === Travel) return travelRepository;
            throw new Error('Unexpected transaction repository');
          },
        } as unknown as EntityManager;

        try {
          const result = await runInTransaction(manager);
          committedRide = workingRide;
          committedRequests = [...workingRequests.values()];
          committedBookings = [...workingBookings.values()];
          committedTravels = workingTravels;
          return result;
        } finally {
          releaseTransaction();
        }
      },
    ),
  };

  // Non-locking repository used only for the pre-check before the transaction.
  const preCheckRideRepository = {
    findOne: vi.fn(async () => ({ ...committedRide })),
  };

  const service = new TravelService(
    preCheckRideRepository as unknown as Repository<Ride>,
    bookingService,
    dataSource as unknown as DataSource,
    configService,
  );

  return {
    service,
    preCheckRideRepository,
    dataSource,
    rideSave,
    bookingSave,
    requestSave,
    travelSave,
    rideLockOptions,
    bookingLockOptions,
    requestLockOptions,
    lockOrder,
    lockQueries,
    getCommittedState: () => ({
      ride: committedRide,
      requests: committedRequests,
      bookings: committedBookings,
      travels: committedTravels,
    }),
  };
}


describe('departureTimestampMs', () => {
  it('interprets the wall-clock time in the given timezone, not the server tz', () => {
    // 12:00 in America/New_York (EST, UTC-5 in January) is 17:00 UTC.
    expect(
      departureTimestampMs('2026-01-15', '12:00:00', 'America/New_York'),
    ).toBe(Date.parse('2026-01-15T17:00:00Z'));

    // 09:00 in Africa/Douala (UTC+1, no DST) is 08:00 UTC.
    expect(
      departureTimestampMs('2026-06-01', '09:00:00', 'Africa/Douala'),
    ).toBe(Date.parse('2026-06-01T08:00:00Z'));
  });
});

describe('TravelService.startTravel', () => {
  const inWindow = new Date('2026-10-15T11:00:00Z');

  it('creates the travel, marks the ride ongoing, rejects pending, and reopens its request', async () => {
    const ride = makeRide();
    const pendingLinked = makeBooking('b-1', { rideRequest: makeRequest('r-1') });
    const pendingPlain = makeBooking('b-2');
    const approved = makeBooking('a-1', { status: BookingStatus.APPROVED });
    const mocks = createService(ride, [pendingLinked, pendingPlain, approved], [
      makeRequest('r-1'),
    ]);

    const result = await mocks.service.startTravel(rideId, driverId, inWindow);

    const state = mocks.getCommittedState();
    expect(state.ride.status).toBe(RideStatus.ONGOING);
    expect(state.travels).toHaveLength(1);
    expect(state.travels[0]).toMatchObject({
      //status: TravelStatus.IN_PROGRESS,
      origin: 'Yaounde',
      destination: 'Douala',
      ride: { id: rideId },
    });
    // Pending bookings rejected; approved booking left untouched.
    expect(state.bookings.find((b) => b.id === 'b-1')?.status).toBe(
      BookingStatus.REJECTED,
    );
    expect(state.bookings.find((b) => b.id === 'b-2')?.status).toBe(
      BookingStatus.REJECTED,
    );
    expect(state.bookings.find((b) => b.id === 'a-1')?.status).toBe(
      BookingStatus.APPROVED,
    );
    // The linked request reopens once no active booking remains on it.
    expect(state.requests.find((r) => r.id === 'r-1')?.status).toBe(
      RideRequestStatus.OPEN,
    );
    // No password leak in the returned payload.
    expect((result as { driver: Record<string, unknown> }).driver).not.toHaveProperty(
      'password',
    );
    // Lock order: all pending bookings (by id), then their requests, then the ride.
    expect(mocks.lockOrder).toEqual([
      'booking',
      'booking',
      'request',
      'ride',
    ]);
    expect(mocks.rideLockOptions).toEqual([{ mode: 'pessimistic_write' }]);
  });

  it('refuses to start a ride the caller does not drive', async () => {
    const ride = makeRide({ driver: { id: 'someone-else' } as User });
    const mocks = createService(ride, []);

    await expect(
      mocks.service.startTravel(rideId, driverId, inWindow),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mocks.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('refuses to start a ride that is not scheduled', async () => {
    const ride = makeRide({ status: RideStatus.ONGOING });
    const mocks = createService(ride, []);

    await expect(
      mocks.service.startTravel(rideId, driverId, inWindow),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mocks.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('refuses to start before the window opens', async () => {
    const ride = makeRide();
    const mocks = createService(ride, []);
    const tooEarly = new Date('2026-10-15T10:00:00Z');

    await expect(
      mocks.service.startTravel(rideId, driverId, tooEarly),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('refuses to start after the window closes', async () => {
    const ride = makeRide();
    const mocks = createService(ride, []);
    const tooLate = new Date('2026-10-15T14:00:00Z');

    await expect(
      mocks.service.startTravel(rideId, driverId, tooLate),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('honours custom window bounds from config', async () => {
    const ride = makeRide();
    // A tight 5-minute window still includes the departure instant (11:00Z).
    const tight = createService(ride, [], [], [], { before: '5', after: '5' });
    await expect(
      tight.service.startTravel(rideId, driverId, inWindow),
    ).resolves.toBeDefined();
  });
});

describe('TravelService.endTravel', () => {
  const completedAt = new Date('2026-10-15T15:00:00Z');

  // An in-progress travel for the default ride; status/links overridable.
  function makeTravel(overrides: Partial<Travel> = {}): Travel {
    return {
      id: 't-1',
      status: TravelStatus.IN_PROGRESS,
      startedAt: new Date('2026-10-15T11:00:00Z'),
      completedAt: null,
      origin: 'Yaounde',
      destination: 'Douala',
      driver: { id: driverId, password: 'hash' } as User,
      ride: { id: rideId } as Ride,
      ...overrides,
    } as Travel;
  }

  it('completes the travel and ride, rejects pending, keeps approved, and reopens a lone request', async () => {
    const ride = makeRide({ status: RideStatus.ONGOING });
    const pendingLinked = makeBooking('b-1', {
      rideRequest: makeRequest('r-1'),
    });
    const approved = makeBooking('a-1', { status: BookingStatus.APPROVED });
    const mocks = createService(
      ride,
      [pendingLinked, approved],
      [makeRequest('r-1')],
      [makeTravel()],
    );

    const result = await mocks.service.endTravel(rideId, driverId, completedAt);

    const state = mocks.getCommittedState();
    expect(state.ride.status).toBe(RideStatus.COMPLETED);
    expect(result).toMatchObject({
      id: 't-1',
      status: 'completed',
      completedAt,
    });
    expect(state.travels.find((t) => t.id === 't-1')?.status).toBe(
      TravelStatus.COMPLETED,
    );
    // Pending rejected; the approved passenger stays approved.
    expect(state.bookings.find((b) => b.id === 'b-1')?.status).toBe(
      BookingStatus.REJECTED,
    );
    expect(state.bookings.find((b) => b.id === 'a-1')?.status).toBe(
      BookingStatus.APPROVED,
    );
    // The lone linked request reopens once no active booking remains on it.
    expect(state.requests.find((r) => r.id === 'r-1')?.status).toBe(
      RideRequestStatus.OPEN,
    );
    // No password leak in the returned payload.
    expect((result as { driver: Record<string, unknown> }).driver).not.toHaveProperty(
      'password',
    );
    // Lock order: booking -> request, then the ride.
    expect(mocks.lockOrder).toEqual(['booking', 'request', 'ride']);
    expect(mocks.rideLockOptions).toEqual([{ mode: 'pessimistic_write' }]);
  });

  it('does not reopen the request of an approved booking when the travel completes', async () => {
    const ride = makeRide({ status: RideStatus.ONGOING });
    const pendingLinked = makeBooking('b-1', {
      rideRequest: makeRequest('r-1'),
    });
    const approvedLinked = makeBooking('a-1', {
      status: BookingStatus.APPROVED,
      rideRequest: makeRequest('r-2'),
    });
    const mocks = createService(
      ride,
      [pendingLinked, approvedLinked],
      [makeRequest('r-1'), makeRequest('r-2')],
      [makeTravel()],
    );

    await mocks.service.endTravel(rideId, driverId, completedAt);

    const state = mocks.getCommittedState();
    // The rejected pending booking reopens its request...
    expect(state.requests.find((r) => r.id === 'r-1')?.status).toBe(
      RideRequestStatus.OPEN,
    );
    // ...but the approved booking's request stays accepted (not reopened).
    expect(state.requests.find((r) => r.id === 'r-2')?.status).toBe(
      RideRequestStatus.ACCEPTED,
    );
    expect(state.bookings.find((b) => b.id === 'a-1')?.status).toBe(
      BookingStatus.APPROVED,
    );
  });

  it('refuses to end a ride the caller does not drive', async () => {
    const ride = makeRide({
      status: RideStatus.ONGOING,
      driver: { id: 'someone-else' } as User,
    });
    const mocks = createService(ride, [], [], [makeTravel()]);

    await expect(
      mocks.service.endTravel(rideId, driverId, completedAt),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mocks.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('refuses to end a ride that is not ongoing', async () => {
    const ride = makeRide({ status: RideStatus.SCHEDULED });
    const mocks = createService(ride, [], [], [makeTravel()]);

    await expect(
      mocks.service.endTravel(rideId, driverId, completedAt),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mocks.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('refuses to complete a travel that is not in progress', async () => {
    const ride = makeRide({ status: RideStatus.ONGOING });
    const mocks = createService(ride, [], [], [
      makeTravel({ status: TravelStatus.COMPLETED }),
    ]);

    await expect(
      mocks.service.endTravel(rideId, driverId, completedAt),
    ).rejects.toBeInstanceOf(ConflictException);
    // The transaction aborts, so the ride stays ongoing.
    expect(mocks.getCommittedState().ride.status).toBe(RideStatus.ONGOING);
  });

  it('refuses to end a ride that has no travel', async () => {
    const ride = makeRide({ status: RideStatus.ONGOING });
    const mocks = createService(ride, [], [], []);

    await expect(
      mocks.service.endTravel(rideId, driverId, completedAt),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

