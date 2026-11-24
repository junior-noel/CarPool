import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { VehicleService } from '../vehicles/vehicle.service.js';
import { CreateVehicleDto } from '../vehicles/dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from '../vehicles/dto/update-vehicle.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';
import { DriverGuard } from '../auth/guards/driver.guard.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Vehicle } from './vehicle.entity.js';

@ApiTags('Vehicle')
@ApiBearerAuth('JWT-auth')
@Controller('vehicles')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @ApiOperation({
    summary: 'Create a Vehicle',
    description:
      'Allows an approved Driver to create a vehicle.',
  })
  @ApiCreatedResponse({
    description: 'Vehicle created successfully',
    type: Vehicle,
  })
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

  @ApiOperation({
    summary: 'Update a vehicle',
    description: 'Allows an approved driver to update one of their vehicles.',
  })
  @ApiOkResponse({
    description: 'Vehicle updated successfully',
    type: Vehicle,
  })
  @ApiParam({
    name: 'id',
    description: 'ID of the vehicle to update',
  })
  @UseGuards(JwtAuthGuard, DriverGuard)
  @Patch(':id')
  updateVehicle(
    @Param('id') vehicleId: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vehicleService.update(
      vehicleId,
      updateVehicleDto,
      request.user.userId,
    );
  }

  @ApiOperation({
    summary: 'Delete a vehicle',
    description:
      'Allows an approved driver to delete one of their vehicles when it has no ride history.',
  })
  @ApiOkResponse({
    description: 'Vehicle deleted successfully',
  })
  @ApiParam({
    name: 'id',
    description: 'ID of the vehicle to delete',
  })
  @UseGuards(JwtAuthGuard, DriverGuard)
  @Delete(':id')
  deleteVehicle(
    @Param('id') vehicleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vehicleService.delete(vehicleId, request.user.userId);
  }
}
