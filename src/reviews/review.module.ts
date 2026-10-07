import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Review } from './review.entity.js';
import { ReviewService } from './review.service.js';
import { Travel } from '../travel/travel.entity.js';
import { Booking } from '../bookings/booking.entity.js';
import { User } from '../users/user.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([Review, Travel, Booking, User])],
    providers: [ReviewService],
    exports: [ReviewService],
})
export class ReviewModule {}
