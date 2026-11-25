import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RidesService } from './rides.service.js';
import { Ride, RideStatus } from './ride.entity.js';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';
import {
  RideRequest,
  RideRequestStatus,
} from '../ride-request/ride-request.entity.js';

// Build a rides service whose transaction manager exposes only the repositories
// needed by the lifecycle methods under test.
function createLifecycleService() {
  const rideRepository = {
    findOne: vi.fn(),
    save: vi.fn(),
  };
  const bookingRepository = {
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(),
    count: vi.fn(),
  };
  const requestRepository = {
    findOne: vi.fn(),
    save: vi.fn(),
  };
  const vehicleRepository = {};
  const userService = {};
  const configService = {
    get: vi.fn((key: string) =>
      key === 'APP_TIMEZONE' ? 'Africa/Douala' : undefined,
    ),
  };
  const dataSource = {
    transaction: vi.fn(async (work: (manager: any) => Promise<unknown>) =>
      work({
        getRepository: vi.fn((entity: unknown) => {
          if (entity === Ride) return rideRepository;
          if (entity === Booking) return bookingRepository;
          if (entity === RideRequest) return requestRepository;
          return vehicleRepository;
        }),
      }),
    ),
  };

  const service = new RidesService(
    rideRepository as any,
    vehicleRepository as any,
    userService as any,
    configService as any,
    {} as any,
    dataSource as any,
  );

  return {
    service,
    rideRepository,
    bookingRepository,
    requestRepository,
  };
}

describe('RidesService lifecycle operations', () => {
  it('updates a future ride owned by the authenticated driver', async () => {
    const { service, rideRepository, bookingRepository } =
      createLifecycleService();
    const ride = {
      id: 'ride-1',
      status: RideStatus.SCHEDULED,
      origin: 'Yaounde',
      destination: 'Douala',
      departureDate: new Date('2099-06-10T00:00:00.000Z'),
      departureTime: '09:00:00',
      totalSeat: 4,
      availableSeat: 4,
      seatPerPrice: 2500,
      driver: { id: 'driver-1', password: 'hash' },
      vehicle: { id: 'vehicle-1', owner: { id: 'driver-1', password: 'hash' } },
    };

    rideRepository.findOne
      .mockResolvedValueOnce(ride)
      .mockResolvedValueOnce(ride);
    bookingRepository.find.mockResolvedValue([]);
    rideRepository.save.mockImplementation(async (value) => value);

    const result = await service.update('ride-1', 'driver-1', {
      origin: 'Mvan',
      availableSeats: 3,
    });

    expect(result.origin).toBe('Mvan');
    expect(result.availableSeat).toBe(3);
    expect(JSON.stringify(result)).not.toMatch(/password|hash/i);
  });

  it('rejects updating another driver ride', async () => {
    const { service, rideRepository } = createLifecycleService();
    rideRepository.findOne.mockResolvedValue({
      id: 'ride-1',
      status: RideStatus.SCHEDULED,
      driver: { id: 'other-driver' },
      vehicle: { owner: { id: 'other-driver' } },
    });

    await expect(
      service.update('ride-1', 'driver-1', { origin: 'Mvan' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects updating a ride that is no longer scheduled', async () => {
    const { service, rideRepository } = createLifecycleService();
    rideRepository.findOne.mockResolvedValue({
      id: 'ride-1',
      status: RideStatus.ONGOING,
      driver: { id: 'driver-1' },
      vehicle: { owner: { id: 'driver-1' } },
    });

    await expect(
      service.update('ride-1', 'driver-1', { origin: 'Mvan' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels a ride and active bookings while reopening their ride request', async () => {
    const {
      service,
      rideRepository,
      bookingRepository,
      requestRepository,
    } = createLifecycleService();
    const ride = {
      id: 'ride-1',
      status: RideStatus.SCHEDULED,
      driver: { id: 'driver-1', password: 'hash' },
      vehicle: { id: 'vehicle-1', owner: { id: 'driver-1', password: 'hash' } },
    };
    const booking = {
      id: 'booking-1',
      status: BookingStatus.APPROVED,
      rideRequest: { id: 'request-1' },
    };
    const rideRequest = {
      id: 'request-1',
      status: RideRequestStatus.ACCEPTED,
      ride: ride,
    };

    rideRepository.findOne
      .mockResolvedValueOnce(ride)
      .mockResolvedValueOnce(ride);
    bookingRepository.find.mockResolvedValue([booking]);
    bookingRepository.findOne.mockResolvedValue(booking);
    bookingRepository.save.mockImplementation(async (value) => value);
    bookingRepository.count.mockResolvedValue(0);
    requestRepository.findOne.mockResolvedValue(rideRequest);
    requestRepository.save.mockImplementation(async (value) => value);
    rideRepository.save.mockImplementation(async (value) => value);

    const result = await service.cancel('ride-1', 'driver-1');

    expect(result.status).toBe(RideStatus.CANCELLED);
    expect(booking.status).toBe(BookingStatus.CANCELLED);
    expect(rideRequest.status).toBe(RideRequestStatus.OPEN);
    expect(rideRequest.ride).toBeNull();
  });

  it('rejects cancelling a ride that is not scheduled', async () => {
    const { service, rideRepository } = createLifecycleService();
    rideRepository.findOne
      .mockResolvedValueOnce({
        id: 'ride-1',
        status: RideStatus.COMPLETED,
      })
      .mockResolvedValueOnce({
        id: 'ride-1',
        status: RideStatus.COMPLETED,
        driver: { id: 'driver-1' },
        vehicle: { owner: { id: 'driver-1' } },
      });

    await expect(service.cancel('ride-1', 'driver-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects past ride updates', async () => {
    const { service, rideRepository } = createLifecycleService();
    rideRepository.findOne.mockResolvedValue({
      id: 'ride-1',
      status: RideStatus.SCHEDULED,
      driver: { id: 'driver-1' },
      vehicle: { id: 'vehicle-1', seats: 4, owner: { id: 'driver-1' } },
      departureDate: new Date('2020-01-01T00:00:00.000Z'),
      departureTime: '09:00:00',
      availableSeat: 4,
      totalSeat: 4,
    });

    await expect(
      service.update('ride-1', 'driver-1', { origin: 'Mvan' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
