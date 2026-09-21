import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { DriverApplicationService } from './driver-application.service.js';
import { CreateDriverApplicationDto } from './dto/create-driver-application.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@Controller('driver-application')
export class DriverApplicationController {
    constructor(
        private readonly driverApplicationService: DriverApplicationService,
    ) { }
    
    //only authentcated users can submt a drver application
    @UseGuards(JwtAuthGuard)
    @Post()
    createApplication(
        @Body() createDto: CreateDriverApplicationDto,
        @Req() request: AuthenticatedRequest,
    ) { 
        //get the user ID from the verified jwt
        const userId = request.user.userId;

        return this.driverApplicationService.create(
            userId,
            createDto,
        );

    };
}