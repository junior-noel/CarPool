import { Controller, UseGuards } from "@nestjs/common";
import { RideRequestService } from "./ride-request.service.js";
import { Body, Post, Req, Get } from "@nestjs/common";
import { PassengerGuard } from "../passenger-application/guards/passenger.guard.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { CreateRideRequestDto } from "./dto/create-ride-request.dto.js";
import type { AuthenticatedRequest } from "../auth/interfaces/authenticated-request.interface.js";
import { DriverGuard } from "../auth/guards/driver.guard.js";
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

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
//route fore open request
  @UseGuards(JwtAuthGuard, DriverGuard)
  @Get('open')
  getOpenRequests() {
    return this.rideRequestService.findOpenRequests();
  }
}
