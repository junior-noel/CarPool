import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';

import { TravelService } from './travel.service.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@Controller('travels')
export class TravelTrackingController {
  constructor(private readonly travelService: TravelService) {}

  @Post(':travelId/location')
  @UseGuards(JwtAuthGuard)
  async updateParticipantLocation(
    @Param('travelId') travelId: string,
    @Body() dto: UpdateLocationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.travelService.updateParticipantLocation(
      travelId,
      req.user.userId,
      dto,
    );
  }
}
