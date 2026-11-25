import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RideStatus } from '../rides/ride.entity.js';
import { VehicleService } from './vehicle.service.js';

const createService = () => {
  const vehicleRepository = {
    findOne: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };
  const rideRepository = {
    find: vi.fn(),
    count: vi.fn(),
  };
  const userService = {
    findById: vi.fn(),
  };

  const service = new VehicleService(
    vehicleRepository as any,
    rideRepository as any,
    userService as any,
  );

  return { service, vehicleRepository, rideRepository };
};

describe('VehicleService', () => {
  it('updates a vehicle owned by the authenticated driver', async () => {
    const { service, vehicleRepository, rideRepository } = createService();
    const vehicle = {
      id: 'vehicle-1',
      make: 'Toyota',
      model: 'Corolla',
      owner: { id: 'driver-1' },
    };
    vehicleRepository.findOne
      .mockResolvedValueOnce(vehicle)
      .mockResolvedValueOnce(null);
    rideRepository.find.mockResolvedValue([]);
    vehicleRepository.save.mockImplementation(async (value) => value);

    await expect(
      service.update('vehicle-1', { color: 'blue' }, 'driver-1'),
    ).resolves.toMatchObject({ id: 'vehicle-1', color: 'blue' });
  });

  it('rejects updating another driver vehicle', async () => {
    const { service, vehicleRepository } = createService();
    vehicleRepository.findOne.mockResolvedValue({
      id: 'vehicle-1',
      owner: { id: 'other-driver' },
    });

    await expect(
      service.update('vehicle-1', { color: 'blue' }, 'driver-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects reducing capacity below an active ride requirement', async () => {
    const { service, vehicleRepository, rideRepository } = createService();
    vehicleRepository.findOne.mockResolvedValue({
      id: 'vehicle-1',
      owner: { id: 'driver-1' },
    });
    rideRepository.find.mockResolvedValue([
      { totalSeat: 4, status: RideStatus.SCHEDULED },
    ]);

    await expect(
      service.update('vehicle-1', { seats: 3 }, 'driver-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes an owned vehicle without ride history', async () => {
    const { service, vehicleRepository, rideRepository } = createService();
    const vehicle = {
      id: 'vehicle-1',
      owner: { id: 'driver-1' },
    };
    vehicleRepository.findOne.mockResolvedValue(vehicle);
    rideRepository.count.mockResolvedValue(0);
    vehicleRepository.remove.mockResolvedValue(vehicle);

    await expect(service.delete('vehicle-1', 'driver-1')).resolves.toEqual({
      message: 'Vehicle deleted successfully',
    });
  });

  it('does not delete a vehicle associated with a ride', async () => {
    const { service, vehicleRepository, rideRepository } = createService();
    vehicleRepository.findOne.mockResolvedValue({
      id: 'vehicle-1',
      owner: { id: 'driver-1' },
    });
    rideRepository.count.mockResolvedValue(1);

    await expect(service.delete('vehicle-1', 'driver-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not delete another driver vehicle', async () => {
    const { service, vehicleRepository } = createService();
    vehicleRepository.findOne.mockResolvedValue({
      id: 'vehicle-1',
      owner: { id: 'other-driver' },
    });

    await expect(service.delete('vehicle-1', 'driver-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns not found for a missing vehicle', async () => {
    const { service, vehicleRepository } = createService();
    vehicleRepository.findOne.mockResolvedValue(null);

    await expect(service.delete('missing', 'driver-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
