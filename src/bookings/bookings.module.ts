import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { Booking } from './booking.entity.js';
import { BookingController } from './bookings.controller.js';
import { BookingService } from './bookings.service.js';

import { UserModule } from '../users/user.module.js';
import { RidesModule } from '../rides/rides.module.js';
import { PassengerApplicationModule } from '../passenger-application/passenger-application.module.js';
import { Ride } from '../rides/ride.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Ride]),
    UserModule,
    // Gives the booking feature access to ride-related functionality.
    RidesModule,
    PassengerApplicationModule,
    AuthModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],

  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
