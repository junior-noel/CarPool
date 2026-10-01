import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { CreatePassengerApplicationDto } from './dto/create-passenger-application.dto.js';
import {
  PassengerApplication,
  PassengerApplicationStatus,
} from './passenger-application.entity.js';
import { PassengerApplicationService } from './passenger-application.service.js';
import { User } from '../users/user.entity.js';
import type { UserService } from '../users/user.service.js';

const privateApplicant = {
  id: 'passenger-user-id',
  firstName: 'Parker',
  lastName: 'Passenger',
  email: 'parker@example.com',
  phoneNumber: '+237677654321',
  password: 'password-hash',
  role: 'user',
} as User;

// Create isolated passenger-application dependencies for each test.
function createService() {
  const applicationRepository = {
    findOne: vi.fn(),
    create: vi.fn((value: Partial<PassengerApplication>) => value),
    save: vi.fn(async (value: PassengerApplication) => value),
  };
  const userService = { findById: vi.fn() };
  const service = new PassengerApplicationService(
    applicationRepository as unknown as Repository<PassengerApplication>,
    userService as unknown as UserService,
  );

  return { service, applicationRepository, userService };
}

// Assert passenger responses contain only the documented application and applicant fields.
function expectSafePassengerResponse(response: Record<string, unknown>) {
  expect(Object.keys(response)).toEqual([
    'id',
    'status',
    'submittedAt',
    'reviewedAt',
    'user',
  ]);
  expect(response.user).toEqual({
    id: privateApplicant.id,
    firstName: privateApplicant.firstName,
    lastName: privateApplicant.lastName,
  });
  expect(JSON.stringify(response)).not.toMatch(
    /password|email|phoneNumber|identificationNumber|identificationType|token|otp/i,
  );
}

describe('PassengerApplicationService response privacy', () => {
  it('creates a pending application with a safe applicant response', async () => {
    const mocks = createService();
    const submittedAt = new Date();
    const dto = {
      phoneNumber: '+237677654321',
      identificationNumber: 'ID-2026-123',
      identificationType: 'National ID',
    } as CreatePassengerApplicationDto;
    mocks.userService.findById.mockResolvedValue(privateApplicant);
    mocks.applicationRepository.findOne.mockResolvedValue(null);
    mocks.applicationRepository.save.mockImplementation(
      async (application: PassengerApplication) => ({
        ...application,
        id: 'passenger-application-id',
        submittedAt,
        reviewedAt: null,
        rejectionReason: null,
      }),
    );

    const response = await mocks.service.create(privateApplicant.id, dto);

    expectSafePassengerResponse(response as unknown as Record<string, unknown>);
    expect(response).toMatchObject({
      id: 'passenger-application-id',
      status: PassengerApplicationStatus.PENDING,
      submittedAt,
      reviewedAt: null,
    });
    expect(mocks.applicationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: privateApplicant,
        identificationNumber: dto.identificationNumber,
        status: PassengerApplicationStatus.PENDING,
      }),
    );
  });

  it('approves the application and returns a safe applicant response', async () => {
    const mocks = createService();
    const application = {
      id: 'passenger-application-id',
      user: { ...privateApplicant },
      status: PassengerApplicationStatus.PENDING,
      phoneNumber: '+237677654321',
      identificationNumber: 'ID-2026-123',
      identificationType: 'National ID',
      submittedAt: new Date('2026-09-01T10:00:00.000Z'),
      reviewedAt: null,
      rejectionReason: 'old reason',
    } as PassengerApplication;
    mocks.applicationRepository.findOne.mockResolvedValue(application);
    mocks.applicationRepository.save.mockImplementation(
      async (saved: PassengerApplication) => saved,
    );

    const response = await mocks.service.approve(application.id);

    expectSafePassengerResponse(response as unknown as Record<string, unknown>);
    expect(response.status).toBe(PassengerApplicationStatus.APPROVED);
    expect(response.reviewedAt).toBeInstanceOf(Date);
    expect(application.rejectionReason).toBeNull();
    expect(mocks.applicationRepository.save).toHaveBeenCalledOnce();
  });

  it('rejects an already-reviewed application without saving it again', async () => {
    const mocks = createService();
    mocks.applicationRepository.findOne.mockResolvedValue({
      id: 'passenger-application-id',
      status: PassengerApplicationStatus.APPROVED,
    });

    await expect(
      mocks.service.approve('passenger-application-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.applicationRepository.save).not.toHaveBeenCalled();
  });
});
