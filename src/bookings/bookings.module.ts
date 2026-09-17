import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { BookingsController } from './bookings.controller.js';

@Module({
  providers: [BookingsService],
  controllers: [BookingsController]
})
export class BookingsModule {}
