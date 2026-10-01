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
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'pending',
        submittedAt: '2026-10-01T10:00:00.000Z',
        licenseExpiryDate: '2028-10-01',
        reviewedAt: null,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          firstName: 'Alex',
          lastName: 'Driver',
        },
      },
    },
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
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'approved',
        submittedAt: '2026-10-01T10:00:00.000Z',
        licenseExpiryDate: '2028-10-01',
        reviewedAt: '2026-10-01T11:00:00.000Z',
        user: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          firstName: 'Alex',
          lastName: 'Driver',
        },
      },
    },
  })
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/approve')
  approveApplication(@Param('id') id: string) {
    return this.driverApplicationService.approve(id);
  }
}