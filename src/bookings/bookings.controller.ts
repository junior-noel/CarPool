import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
    UseGuards,
  Patch
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { BookingService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { Booking } from './booking.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PassengerGuard } from '../passenger-application/guards/passenger.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';
import { DriverGuard } from '../auth/guards/driver.guard.js';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // Create a new booking.
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'Allows an approved passenger to request seats on an existing ride.',
  })
  @ApiCreatedResponse({
    description: 'Booking successfully created',
    type: Booking,
  })
  @UseGuards(JwtAuthGuard, PassengerGuard)
  @Post()
  createBooking(
    @Body() createBookingDto: CreateBookingDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = Number(request.user.userId);

    return this.bookingService.create(userId, createBookingDto);
  }

  // Get bookings belonging to the authenticated passenger.
  @ApiOperation({
    summary: 'Get my bookings',
    description: 'Returns all bookings created by the authenticated passenger.',
  })
  @ApiOkResponse({
    description: 'Bookings retrieved successfully',
    type: [Booking],
  })
  @UseGuards(JwtAuthGuard, PassengerGuard)
  @Get('my-bookings')
  getMyBookings(@Req() request: AuthenticatedRequest) {
    const userId = Number(request.user.userId);

    return this.bookingService.findMyBookings(userId);
  }

  // Get all bookings for a ride owned by the authenticated driver.
  @ApiOperation({
    summary: 'Get bookings for my ride',
    description:
      'Allows an approved driver to view all bookings made for one of their rides.',
  })
  @ApiParam({
    name: 'rideId',
    description: 'ID of the ride',
    example: 3,
    type: Number,
  })
  @ApiOkResponse({
    description: 'Bookings for the ride retrieved successfully',
    type: [Booking],
  })
  @UseGuards(JwtAuthGuard, DriverGuard)
  @Get('ride/:rideId')
  getRideBookings(
    @Param('rideId') rideId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const driverId = Number(request.user.userId);
    const id = Number(rideId);

    return this.bookingService.findBookingsForDriver(driverId, id);
  }

  @ApiOperation({
    summary: 'Approve a bookng',
    description:'',
  })
  @UseGuards(JwtAuthGuard, DriverGuard)
  @Patch(':id/approve')
  approveBooking(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const bookingId = Number(id);
    const driverId = Number(request.user.userId);

    return this.bookingService.approveBooking(driverId, bookingId);
  }
}
