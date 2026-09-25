import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { RidesService } from './rides.service.js';
import { CreateRideDto } from './dto/create-ride-dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DriverGuard } from '../auth/guards/driver.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Rides')
  @ApiBearerAuth()
@Controller('rides')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  // Only authenticated users with the driver role
  // can create a ride.
  @UseGuards(JwtAuthGuard, DriverGuard)
  @Post()
  createRide(
    @Body() createRideDto: CreateRideDto,
    @Req() request: AuthenticatedRequest,
  ) {
    // Get the driver's ID from the verified JWT.
    const userId = request.user.userId;

    // Pass the driver ID and ride information
    // to the service for validation and creation.
    return this.ridesService.create(userId, createRideDto);
  }
}
