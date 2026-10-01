import { Body, Controller, Patch, Post, Req, UseGuards, Param, } from '@nestjs/common';
import { PassengerApplicationService } from './passenger-application.service.js';
import { CreatePassengerApplicationDto } from './dto/create-passenger-application.dto.js';
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
import { PassengerGuard } from './guards/passenger.guard.js';


@ApiTags('Passenger Application')
@ApiBearerAuth()
@Controller('passenger-application')
export class PassengerApplicationController {
  constructor(
    private readonly passengerApplicationService: PassengerApplicationService,
  ) {}

  @ApiOperation({
    summary: 'Passanger application',
    description: 'Allows passengers to create an application',
  })
  @ApiCreatedResponse({
    description: 'Apllication successfully created',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'pending',
        submittedAt: '2026-10-01T10:00:00.000Z',
        reviewedAt: null,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          firstName: 'Alex',
          lastName: 'Passenger',
        },
      },
    },
  })
  // Allows an authenticated user to applyto become an approved passenger.
  @UseGuards(JwtAuthGuard)
  @Post()
  createApplication(
    @Body() createDto: CreatePassengerApplicationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    //  Get the user's ID from the verified JWT.
    const userId = request.user.userId;
    return this.passengerApplicationService.create(userId, createDto);
  }

  @ApiOperation({
    summary: 'Approve passenger application',
    description: 'Allows Admin to approve passenger application',
  })
  @ApiOkResponse({
    description: 'Apllication approved',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'approved',
        submittedAt: '2026-10-01T10:00:00.000Z',
        reviewedAt: '2026-10-01T11:00:00.000Z',
        user: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          firstName: 'Alex',
          lastName: 'Passenger',
        },
      },
    },
  })
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/approve')
  approveApplication(@Param('id') id: string) {
    return this.passengerApplicationService.approve(id);
  }
}
