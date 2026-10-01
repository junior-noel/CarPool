import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {DriverApplication,DriverApplicationStatus,} from './driver-application.entity.js';
import { CreateDriverApplicationDto } from './dto/create-driver-application.dto.js';
import { UserService } from '../users/user.service.js';

export interface DriverApplicationResponse {
    id: string;
    status: DriverApplicationStatus;
    submittedAt: Date;
    licenseExpiryDate: Date;
    reviewedAt: Date | null;
    user: {
        id: string;
        firstName: string;
        lastName: string;
    };
}

@Injectable()
export class DriverApplicationService{
    constructor(
    @InjectRepository(DriverApplication)
    private readonly applicationRepository: Repository<DriverApplication>,
    private readonly userService: UserService,
    ) { }

    // Build a response containing application details and applicant identity only.
    private toResponse(application: DriverApplication): DriverApplicationResponse {
        return {
            id: application.id,
            status: application.status,
            submittedAt: application.submittedAt,
            licenseExpiryDate: application.licenseExpiryDate,
            reviewedAt: application.reviewedAt,
            user: {
                id: application.user.id,
                firstName: application.user.firstName,
                lastName: application.user.lastName,
            },
        };
    }
    
    async create(
        userId: string,
        createDto: CreateDriverApplicationDto,
    ): Promise<DriverApplicationResponse> {

        //find the user submttng the applcation
        const user = await this.userService.findById(userId);
        if (!user) {
            throw new NotFoundException('user not found')
        }

        if (user.role === 'driver') {
            throw new ConflictException('user is already a driver');
        }

        //check weather the user already have an applcation
        const existingApplication = await this.applicationRepository.findOne({
            where: {
                user: { id: userId },
            },
        });

        if (existingApplication) {
            throw new ConflictException('you already have a driver application')
        };

        //create the application
        const applcation = this.applicationRepository.create({
          user,
          licenseNumber: createDto.licenseNumber,
          licenseExpiryDate: new Date(createDto.licenseExpiryDate),
          phoneNumber: createDto.phoneNumber,
          //start the application as pending
          status: DriverApplicationStatus.PENDING,
        });

        const savedApplication = await this.applicationRepository.save(applcation);
        return this.toResponse(savedApplication);
    }

    async approve(applcationId: string): Promise<DriverApplicationResponse>{
      //find the driver applicaton
      const applcation = await this.applicationRepository.findOne({
        where: { id: applcationId },
        relations: ['user'],
      });

      // Stop if the application doesn't exist.
      if (!applcation) {
        throw new NotFoundException('Driver application not found');
      }

        // An application that has already been reviewed should not be approved again.
        if (applcation.status !== DriverApplicationStatus.PENDING) {
            throw new BadRequestException( 'This driver application has already been reviewed', );
        }

        //Change the applcaton role to drver
        applcation.user.role = 'driver';

        //save the updated user
        await this.userService.updateRole(
            applcation.user.id, 'driver',
        )

        //make the spplcston as approve
        applcation.status = DriverApplicationStatus.APPROVED;
        applcation.reviewedAt = new Date();
        const savedApplication = await this.applicationRepository.save(applcation);
        return this.toResponse(savedApplication);
    }
}
