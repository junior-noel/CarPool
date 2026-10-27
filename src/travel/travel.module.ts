import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { Travel } from './travel.entity.js';
import { TravelController } from './travel.controller.js';
import { TravelService } from './travel.service.js';
import { Ride } from '../rides/ride.entity.js';
import { BookingModule } from '../bookings/bookings.module.js';
import { ParticipantLocation } from './participant-location.entity.js';
import { TravelPosition } from './travel-position.entity.js';
import { TravelTrackingController } from './travel-tracking.controller.js';
import { Booking } from '../bookings/booking.entity.js';
import { GpsValidationService } from './gps-validation.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Travel,
      Ride,
      Booking,
      ParticipantLocation,
      TravelPosition,
    ]),
    // Provides BookingService, whose public reopen helper this service reuses.
    BookingModule,
    // Required by JwtAuthGuard used on the start route.
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],
  controllers: [TravelController, TravelTrackingController],
  providers: [TravelService, GpsValidationService],
})
export class TravelModule {}
