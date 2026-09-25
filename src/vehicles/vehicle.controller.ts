import { Body, Controller, Post, Redirect, UseGuards, Req } from '@nestjs/common';
import { VehicleService } from '../vehicles/vehicle.service.js';
import { CreateVehicleDto } from '../vehicles/dto/create-vehicle.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';
import { DriverGuard } from '../auth/guards/driver.guard.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Vehicle')
  @ApiBearerAuth()
@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @UseGuards(JwtAuthGuard, DriverGuard)
  @Post()
  createVehicle(
    @Body() createVehicleDto: CreateVehicleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    //The controller gets the user ID from the JWT.  userId comes from the verified JWT token.
    const userId = request.user.userId;

    // Pass the vehicle data and authenticated user's ID to the service.
    return this.vehicleService.create(createVehicleDto, userId);
  }
}
