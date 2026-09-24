import { Controller, UseGuards } from "@nestjs/common";
import { RideRequestService } from "./ride-request.service.js";
import { Body, Post, Req } from "@nestjs/common";
import { PassengerGuard } from "../passenger-application/guards/passenger.guard.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { CreateRideRequestDto } from "./dto/create-ride-request.dto.js";
import { request } from "http";
import type { AuthenticatedRequest } from "../auth/interfaces/authenticated-request.interface.js";

@Controller('rideRequest')
export class RideRequestController {
    constructor(
        private readonly rideRequestService: RideRequestService,

    ) { }

   @UseGuards(JwtAuthGuard, PassengerGuard)
@Post()
createRideRequest(
  @Body() createRideRequestDto: CreateRideRequestDto,
  @Req() request: AuthenticatedRequest,
) {
  const userId = request.user.userId;

  return this.rideRequestService.create(
    userId,
    createRideRequestDto,
  );
}
}