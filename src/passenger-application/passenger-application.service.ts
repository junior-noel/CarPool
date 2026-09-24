import {
  ConflictException,
  Injectable,
  NotFoundException,
    BadRequestException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  PassengerApplication,
  PassengerApplicationStatus,
} from './passenger-application.entity.js';

import { CreatePassengerApplicationDto } from './dto/create-passenger-application.dto.js';

import { UserService } from '../users/user.service.js';
import { promises } from 'dns';
import { User } from '../users/user.entity.js';

@Injectable()
export class PassengerApplicationService {
  constructor(
    // Repository used to create and manage passenger applications.

    @InjectRepository(PassengerApplication)
    private readonly applicationRepository: Repository<PassengerApplication>,

    // UserService allows us to find the authenticated user.

    private readonly userService: UserService,
  ) {}

  // Creates a passenger application for the authenticated user.

  async create(
    userId: number,
    createDto: CreatePassengerApplicationDto,
  ): Promise<object> {
    const user = await this.userService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingApplication = await this.applicationRepository.findOne({
      where: {
        user: {
          id: userId,
        },
      },
    });

    if (existingApplication) {
      throw new ConflictException('You already have a passenger application');
    }

    const application = this.applicationRepository.create({
      user,
      phoneNumber: createDto.phoneNumber,
      identificationNumber: createDto.identificationNumber,
      identificationType: createDto.identificationType,
      status: PassengerApplicationStatus.PENDING,
    });

    const savedApplication = await this.applicationRepository.save(application);

    const { password: _, ...safeUser } = savedApplication.user;

    return {
      id: savedApplication.id,
      user: safeUser,
      phoneNumber: savedApplication.phoneNumber,
      identificationNumber: savedApplication.identificationNumber,
      identificationType: savedApplication.identificationType,
      submittedAt: savedApplication.submittedAt,
      reviewedAt: savedApplication.reviewedAt,
      sattus: savedApplication.status,
      rejectionReason: savedApplication.rejectionReason,
    };
  }

  async approve(applicationId: number): Promise<object> {
    // Find the passenger application and load the related user.
    const application = await this.applicationRepository.findOne({
      where: {
        id: applicationId,
      },
      relations: ['user'],
    });

    // Make sure the application actually exists.
    if (!application) {
      throw new NotFoundException('Passenger application not found');
    }

    // An application can only be reviewed once.
    if (application.status !== PassengerApplicationStatus.PENDING) {
      throw new BadRequestException(
        'This passenger application has already been reviewed',
      );
    }

    // Mark the application as approved.
    application.status = PassengerApplicationStatus.APPROVED;

    application.reviewedAt = new Date();

    application.rejectionReason = null;

    const savedApplication = await this.applicationRepository.save(application);

    // Never expose the user's password hash in the API response.
    const { password: _, ...safeUser } = savedApplication.user;

    return {
      id: savedApplication.id,
      user: safeUser,
      status: savedApplication.status,
      phoneNumber: savedApplication.phoneNumber,
      identificationNumber: savedApplication.identificationNumber,
      identificationType: savedApplication.identificationType,
      submittedAt: savedApplication.submittedAt,
      reviewedAt: savedApplication.reviewedAt,
      rejectionReason: savedApplication.rejectionReason,
    };
  }
}
