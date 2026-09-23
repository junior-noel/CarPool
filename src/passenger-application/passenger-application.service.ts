import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  PassengerApplication,
  PassengerApplicationStatus,
} from './passenger-application.entity.js';

import { CreatePassengerApplicationDto } from './dto/create-passenger-application.dto.js';

import { UserService } from '../users/user.service.js';

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
  ): Promise<PassengerApplication> {

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

   
    return this.applicationRepository.save(application);
  }
}
