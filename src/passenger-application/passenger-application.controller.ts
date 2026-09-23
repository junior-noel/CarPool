import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { PassengerApplicationService } from './passenger-application.service.js';
import { CreatePassengerApplicationDto } from './dto/create-passenger-application.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@Controller('passenger-application')
export class PassengerApplicationController {
  constructor(
    private readonly passengerApplicationService: PassengerApplicationService,
  ) {}

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
}
