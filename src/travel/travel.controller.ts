import {Controller, Param,Post,Req, UseGuards, ParseUUIDPipe,} from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiBadRequestResponse, ApiOperation,ApiParam,ApiTags,} from '@nestjs/swagger';

import { TravelService } from './travel.service.js';
import { Travel } from './travel.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DriverGuard } from '../auth/guards/driver.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

// Declared on the "rides" base path so the start action lives with the ride it
// belongs to, without touching the existing RidesController.
@ApiTags('Travel')
@ApiBearerAuth()
@Controller('rides')
export class TravelController {
  constructor(private readonly travelService: TravelService) {}

  // Only the ride's driver may start it, and only for a scheduled ride within the configured time window.
  @ApiOperation({
    summary: 'Start a travel for a ride',
    description: 'Creates the travel, marks the ride ongoing, and rejects all still-pending bookings. Approved bookings become the travel passengers.',})
  @ApiParam({
    name: 'rideId',
    description: 'ID of the scheduled ride to start',
    type: String,
  })
  @ApiCreatedResponse({
    description: 'Travel started successfully',
    type: Travel,
  })
  @ApiBadRequestResponse({
    description: 'Now is not within the allowed window to start this ride.',
  })
  @ApiConflictResponse({
    description:
      'The caller is not the driver, the ride is not scheduled, or it was already started.',
  })
  @UseGuards(JwtAuthGuard, DriverGuard)
  @Post(':rideId/start')
  startTravel(
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    // The driver id comes from the verified JWT.
    const driverId = request.user.userId;

    return this.travelService.startTravel(rideId, driverId);
  }
}
