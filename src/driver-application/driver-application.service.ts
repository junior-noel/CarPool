import {ConflictException,Injectable,NotFoundException,} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {DriverApplication,DriverApplicationStatus,} from './driver-application.entity.js';
import { CreateDriverApplicationDto } from './dto/create-driver-application.dto.js';
import { UserService } from '../users/user.service.js';

@Injectable()
export class DriverApplicationService{
    constructor(
    @InjectRepository(DriverApplication)
    private readonly applicationRepository: Repository<DriverApplication>,
    private readonly userService: UserService,
    ) { }
    
    async create(
        userId: number,
        createDto: CreateDriverApplicationDto,
    ): Promise<DriverApplication> {

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

        return this.applicationRepository.save(applcation);
    }
}
