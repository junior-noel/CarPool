import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { Travel } from './travel.entity.js';
import { TravelController } from './travel.controller.js';
import { TravelService } from './travel.service.js';
import { Ride } from '../rides/ride.entity.js';
import { BookingModule } from '../bookings/bookings.module.js';


@Module({
  imports: [
    TypeOrmModule.forFeature([Travel, Ride]),
    // Provides BookingService, whose public reopen helper this service reuses.
    BookingModule,
    // Required by JwtAuthGuard used on the start route.
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],
  controllers: [TravelController],
  providers: [TravelService],
})
export class TravelModule {}
