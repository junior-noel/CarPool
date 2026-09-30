import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  Patch,
  Param,
} from '@nestjs/common';
import { DriverApplicationService } from './driver-application.service.js';
import { CreateDriverApplicationDto } from './dto/create-driver-application.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { DriverApplication } from './driver-application.entity.js';

@ApiTags('Driver Application')
@ApiBearerAuth()
@Controller('driver-application')
export class DriverApplicationController {
  constructor(
    private readonly driverApplicationService: DriverApplicationService,
  ) {}

  @ApiOperation({
    summary: 'Create application',
    description: 'Allows users to create a driver application',
  })
  @ApiCreatedResponse({
    description: 'Application created successfully',
    type: DriverApplication,
  })
  //only authentcated users can submt a drver application
  @UseGuards(JwtAuthGuard)
  @Post()
  createApplication(
    @Body() createDto: CreateDriverApplicationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    //get the user ID from the verified jwt
    const userId = request.user.userId;

    return this.driverApplicationService.create(userId, createDto);
  }

  @ApiOperation({
    summary: 'Approve driver application',
    description: 'Allows Admin to approve driver application',
  })
  @ApiOkResponse({
    description: 'Application approved',
    type: DriverApplication,
  })
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/approve')
  approveApplication(@Param('id') id: string) {
    return this.driverApplicationService.approve(id);
  }
}