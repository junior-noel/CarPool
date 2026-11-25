import { ConflictException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';
import { BookingService } from '../bookings/bookings.service.js';
import { Ride, RideStatus } from '../rides/ride.entity.js';
import { User } from '../users/user.entity.js';
import { RideRequest, RideRequestStatus } from './ride-request.entity.js';
import { RideRequestService } from './ride-request.service.js';

const driverId = 'driver-id';
const requestId = 'request-id';
const rideId = 'ride-id';

// Build shared service instances over one serialized transaction store.
function createSharedServices() {
  const ride: Ride = {
    id: rideId,
    driver: { id: driverId } as User,
    status: RideStatus.SCHEDULED,
    departureDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    departureTime: '23:59:00',
    availableSeat: 3,
    seatPerPrice: 12,
  } as Ride;
  let committedRequest: RideRequest = {
    id: requestId,
    status: RideRequestStatus.ACCEPTED,
    origin: 'North Station',
    destination: 'Airport',
    departureDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    preferredTime: '09:00:00',
    seatsNeeded: 1,
    passenger: { id: 'passenger-id', firstName: 'Sam' } as User,
    ride,
  } as RideRequest;
  let committedBookings: Booking[] = [
    {
      id: 'existing-booking',
      status: BookingStatus.PENDING,
      seats: 1,
      totalPrice: 12,
      passenger: committedRequest.passenger,
      ride,
      rideRequest: committedRequest,
    } as Booking,
  ];
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

        const workingRide = { ...ride };
        const workingRequest = {
          ...committedRequest,
          ride: committedRequest.ride,
        };
        const workingBookings = new Map<string, Booking>(
          committedBookings.map((booking): [string, Booking] => [
            booking.id,
            {
              ...booking,
              ride: workingRide,
              rideRequest: workingRequest,
            },
          ]),
        );
        const bookingRepository = {
          findOne: vi.fn(
            async (options: { where: { id: string } }) =>
              workingBookings.get(options.where.id) ?? null,
          ),
          create: vi.fn(
            (value: Partial<Booking>) =>
              ({ ...value, id: 'new-booking' }) as Booking,
          ),
          save: vi.fn(async (booking: Booking) => {
            workingBookings.set(booking.id, booking);
            return booking;
          }),
          count: vi.fn(
            async (options: {
              where: {
                rideRequest: { id: string };
                id: { value: string };
                status: { value: BookingStatus[] };
              };
            }) => {
              const { rideRequest: requestFilter, id, status } = options.where;
              return [...workingBookings.values()].filter(
                (booking) =>
                  booking.rideRequest?.id === requestFilter.id &&
                  booking.id !== id.value &&
                  status.value.includes(booking.status),
              ).length;
            },
          ),
        };
        const rideRequestRepository = {
          findOne: vi.fn(async () => workingRequest),
          save: vi.fn(async (request: RideRequest) => {
            return request;
          }),
        };
        const rideRepository = {
          findOne: vi.fn(async () => workingRide),
        };
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Booking) return bookingRepository;
            if (entity === RideRequest) return rideRequestRepository;
            if (entity === Ride) return rideRepository;
            throw new Error('Unexpected transaction repository');
          },
        } as unknown as EntityManager;

        try {
          const result = await runInTransaction(manager);
          committedRequest = workingRequest;
          committedBookings = [...workingBookings.values()];
          return result;
        } finally {
          releaseTransaction();
        }
      },
    ),
  };
  const sharedDataSource = dataSource as unknown as DataSource;
  const rideRequestService = new RideRequestService(
    {} as Repository<RideRequest>,
    {} as Repository<Ride>,
    {} as Repository<Booking>,
    {} as never,
    sharedDataSource,
  );
  const bookingService = new BookingService(
    {} as Repository<Booking>,
    {} as Repository<Ride>,
    {} as never,
    sharedDataSource,
  );

  return {
    rideRequestService,
    bookingService,
    getState: () => ({
      request: committedRequest,
      bookings: committedBookings,
    }),
  };
}

describe('ride-request acceptance racing booking rejection', () => {
  it.each(['accept-first', 'reject-first'])(
    'commits a consistent result when acceptance starts %s',
    async (order) => {
      const services = createSharedServices();
      const accept = () =>
        services.rideRequestService.acceptRequest(driverId, requestId, {
          rideId,
        });
      const reject = () =>
        services.bookingService.rejectBooking(driverId, 'existing-booking');

      const results =
        order === 'accept-first'
          ? await Promise.allSettled([accept(), reject()])
          : await Promise.allSettled([reject(), accept()]);
      const state = services.getState();
      const linkedBookings = state.bookings.filter(
        (booking) => booking.rideRequest?.id === requestId,
      );

      expect(state.bookings[0].status).toBe(BookingStatus.REJECTED);
      if (order === 'accept-first') {
        expect(results[0].status).toBe('rejected');
        if (results[0].status === 'rejected') {
          expect(results[0].reason).toBeInstanceOf(ConflictException);
        }
        expect(results[1].status).toBe('fulfilled');
        expect(state.request.status).toBe(RideRequestStatus.OPEN);
        expect(state.request.ride).toBeNull();
        expect(linkedBookings).toHaveLength(1);
      } else {
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('fulfilled');
        expect(state.request.status).toBe(RideRequestStatus.ACCEPTED);
        expect(state.request.ride?.id).toBe(rideId);
        expect(linkedBookings).toHaveLength(2);
        expect(linkedBookings[1].status).toBe(BookingStatus.PENDING);
      }
    },
  );
});
