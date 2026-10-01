import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RideRequestService } from './ride-request.service.js';
import { PassengerGuard } from '../passenger-application/guards/passenger.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateRideRequestDto } from './dto/create-ride-request.dto.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';
import { DriverGuard } from '../auth/guards/driver.guard.js';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AcceptRideRequestDto } from './dto/accept-ride-request.dto.js';

@ApiTags('Ride Request')
@ApiBearerAuth()
@Controller('ride-request')
export class RideRequestController {
  constructor(private readonly rideRequestService: RideRequestService) {}

  @UseGuards(JwtAuthGuard, PassengerGuard)
  @Post()
  createRideRequest(
    @Body() createRideRequestDto: CreateRideRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user.userId;

    return this.rideRequestService.create(userId, createRideRequestDto);
  }
  @ApiOperation({
    summary: 'List open ride requests for a driver',
    description:
      "Returns unlinked open requests and requests linked to this driver's eligible rides.",
  })
  @ApiOkResponse({
    description: 'Safe request details with the passenger first name only.',
    schema: {
      example: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          origin: 'North Station',
          destination: 'Airport',
          departureDate: '2026-10-15',
          preferredTime: '09:00:00',
          seatsNeeded: 1,
          status: 'open',
          rideId: null,
          passenger: { firstName: 'Alex' },
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  @ApiForbiddenResponse({ description: 'An approved driver role is required.' })
  @UseGuards(JwtAuthGuard, DriverGuard)
  @Get('open')
  getOpenRequests(@Req() request: AuthenticatedRequest) {
    return this.rideRequestService.findOpenRequests(request.user.userId);
  }

  @ApiOperation({
    summary: 'Accept an open ride request',
    description:
      'Creates a pending booking without reserving seats. Provide rideId only when the request is unlinked.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the ride request',
    type: String,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: AcceptRideRequestDto, required: false })
  @ApiOkResponse({
    description: 'Request accepted and a pending booking created.',
    schema: {
      example: {
        bookingId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'pending',
        rideId: '550e8400-e29b-41d4-a716-446655440002',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        seats: 1,
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'The selected ride is not scheduled, is in the past, has insufficient seats, or is missing for an unlinked request.',
  })
  @ApiForbiddenResponse({
    description: 'The selected or linked ride belongs to another driver.',
  })
  @ApiNotFoundResponse({
    description: 'The request or selected ride was not found.',
  })
  @ApiConflictResponse({ description: 'The request is not open.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, DriverGuard)
  @Patch(':id/accept')
  // Use the authenticated driver identity; clients cannot select a driver.
  acceptRequest(
    @Param('id', ParseUUIDPipe) requestId: string,
    @Body() acceptDto: AcceptRideRequestDto = new AcceptRideRequestDto(),
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rideRequestService.acceptRequest(
      request.user.userId,
      requestId,
      acceptDto,
    );
  }
}
