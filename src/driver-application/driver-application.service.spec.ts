import { ConflictException, BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { CreateDriverApplicationDto } from './dto/create-driver-application.dto.js';
import {
  DriverApplication,
  DriverApplicationStatus,
} from './driver-application.entity.js';
import { DriverApplicationService } from './driver-application.service.js';
import { User } from '../users/user.entity.js';
import type { UserService } from '../users/user.service.js';

const privateApplicant = {
  id: 'driver-user-id',
  firstName: 'Devon',
  lastName: 'Driver',
  email: 'devon@example.com',
  phoneNumber: '+237677123456',
  password: 'password-hash',
  role: 'user',
} as User;

// Create isolated driver-application dependencies for each test.
function createService() {
  const applicationRepository = {
    findOne: vi.fn(),
    create: vi.fn((value: Partial<DriverApplication>) => value),
    save: vi.fn(async (value: DriverApplication) => value),
  };
  const userService = {
    findById: vi.fn(),
    updateRole: vi.fn(),
  };
  const service = new DriverApplicationService(
    applicationRepository as unknown as Repository<DriverApplication>,
    userService as unknown as UserService,
  );

  return { service, applicationRepository, userService };
}

// Assert driver responses contain only the documented application and applicant fields.
function expectSafeDriverResponse(response: Record<string, unknown>) {
  expect(Object.keys(response)).toEqual([
    'id',
    'status',
    'submittedAt',
    'licenseExpiryDate',
    'reviewedAt',
    'user',
  ]);
  expect(response.user).toEqual({
    id: privateApplicant.id,
    firstName: privateApplicant.firstName,
    lastName: privateApplicant.lastName,
  });
  expect(JSON.stringify(response)).not.toMatch(
    /password|email|phoneNumber|licenseNumber|token|otp/i,
  );
}

describe('DriverApplicationService response privacy', () => {
  it('creates a pending application with a safe applicant response', async () => {
    const mocks = createService();
    const submittedAt = new Date();
    const dto = {
      licenseNumber: 'CM-DRIVER-101',
      licenseExpiryDate: new Date('2028-10-01T00:00:00.000Z'),
      phoneNumber: '+237677123456',
    } as CreateDriverApplicationDto;
    mocks.userService.findById.mockResolvedValue(privateApplicant);
    mocks.applicationRepository.findOne.mockResolvedValue(null);
    mocks.applicationRepository.save.mockImplementation(
      async (application: DriverApplication) => ({
        ...application,
        id: 'driver-application-id',
        submittedAt,
        reviewedAt: null,
      }),
    );

    const response = await mocks.service.create(privateApplicant.id, dto);

    expectSafeDriverResponse(response as unknown as Record<string, unknown>);
    expect(response).toMatchObject({
      id: 'driver-application-id',
      status: DriverApplicationStatus.PENDING,
      submittedAt,
      reviewedAt: null,
    });
    expect(mocks.applicationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: privateApplicant,
        licenseNumber: dto.licenseNumber,
        status: DriverApplicationStatus.PENDING,
      }),
    );
  });

  it('approves the application and returns a safe applicant response', async () => {
    const mocks = createService();
    const submittedAt = new Date('2026-09-01T10:00:00.000Z');
    const application = {
      id: 'driver-application-id',
      user: { ...privateApplicant },
      status: DriverApplicationStatus.PENDING,
      licenseNumber: 'CM-DRIVER-101',
      licenseExpiryDate: new Date('2028-10-01T00:00:00.000Z'),
      phoneNumber: '+237677123456',
      submittedAt,
      reviewedAt: null,
      rejectionReason: null,
    } as DriverApplication;
    mocks.applicationRepository.findOne.mockResolvedValue(application);
    mocks.applicationRepository.save.mockImplementation(
      async (saved: DriverApplication) => saved,
    );

    const response = await mocks.service.approve(application.id);

    expectSafeDriverResponse(response as unknown as Record<string, unknown>);
    expect(response.status).toBe(DriverApplicationStatus.APPROVED);
    expect(response.reviewedAt).toBeInstanceOf(Date);
    expect(mocks.userService.updateRole).toHaveBeenCalledWith(
      privateApplicant.id,
      'driver',
    );
    expect(mocks.applicationRepository.save).toHaveBeenCalledOnce();
  });

  it('retains duplicate and already-reviewed application behavior', async () => {
    const mocks = createService();
    mocks.userService.findById.mockResolvedValue({
      ...privateApplicant,
      role: 'driver',
    });
    await expect(
      mocks.service.create(privateApplicant.id, {} as CreateDriverApplicationDto),
    ).rejects.toBeInstanceOf(ConflictException);

    mocks.applicationRepository.findOne.mockResolvedValue({
      id: 'driver-application-id',
      status: DriverApplicationStatus.APPROVED,
    });
    await expect(
      mocks.service.approve('driver-application-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
