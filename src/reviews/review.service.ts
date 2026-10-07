import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Review } from './review.entity.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { Travel, TravelStatus } from '../travel/travel.entity.js';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';
import { User } from '../users/user.entity.js';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,

    // Used to verify that the travel exists and is completed.
    @InjectRepository(Travel)
    private readonly travelRepository: Repository<Travel>,

    // Used to verify that the reviewer actually participated in the travel.
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,

    // Used to verify that the reviewed user exists.
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createReview(reviewerId: string, createReviewDto: CreateReviewDto) {
    const {
      travelId,
      reviewedUserId,
      rating,
      comment,
      isAnonymous = false,
    } = createReviewDto;

    // 1. Make sure the reviewer and reviewed user are different.
    if (reviewerId === reviewedUserId) {
      throw new BadRequestException('You cannot review yourself.');
    }

    // 2. Find the travel and load the ride + driver.
    
    // We need the ride because the ride tells us who the driver of this travel was.
    const travel = await this.travelRepository.findOne({
      where: { id: travelId },
      relations: ['ride', 'ride.driver'],
    });

    if (!travel) {
      throw new NotFoundException('Travel not found.');
    }

    // 3. A review can only be created after the travel is completed.
    if (travel.status !== TravelStatus.COMPLETED) {
      throw new BadRequestException('You can only review a completed travel.');
    }

    // 4. Make sure the reviewed user actually exists.
    const reviewedUser = await this.userRepository.findOne({
      where: { id: reviewedUserId },
    });

    if (!reviewedUser) {
      throw new NotFoundException('Reviewed user not found.');
    }

    // 5. Find an APPROVED booking for this reviewer on the ride belonging to this travel.
    //
    // This proves that the reviewer actually participated in the completed travel.
    const approvedBooking = await this.bookingRepository.findOne({
      where: {
        passenger: { id: reviewerId },
        ride: { id: travel.ride.id },
        status: BookingStatus.APPROVED,
      },
      relations: ['passenger', 'ride', 'ride.driver'],
    });

    // The reviewer must have participated in the travel.
    if (!approvedBooking) {
      throw new BadRequestException('You did not participate in this travel.');
    }
    //-------------------------------------------------------
    // 6. Determine who the reviewer is allowed to review.
    //
    // In the current model:
    //
    // Passenger → Driver
    // Driver    → Passenger
    //
    // The driver's identity comes from ride.driver.
    // The passenger's identity comes from the approved booking.
    // ---------------------------------------------------------
    const driverId = travel.ride.driver.id;
    const passengerId = approvedBooking.passenger.id;

    const isReviewingDriver = reviewedUserId === driverId;
    const isReviewingPassenger = reviewedUserId === passengerId;

    if (!isReviewingDriver && !isReviewingPassenger) {
      throw new BadRequestException( 'You can only review a participant of this travel.', );
    }

    // ---------------------------------------------------------
    // 7. Make sure the reviewer is actually one of the two
    //    participants involved in this review.
    // ---------------------------------------------------------
    const isPassenger = reviewerId === passengerId;
    const isDriver = reviewerId === driverId;

    if (!isPassenger && !isDriver) {
      throw new BadRequestException('You did not participate in this travel.');
    }

    // ---------------------------------------------------------
    // 8. Prevent a passenger from reviewing another passenger,
    //    and prevent the driver from reviewing another driver.
    //
    // Passenger must review driver.
    // Driver must review passenger.
    // ---------------------------------------------------------
    if (isPassenger && !isReviewingDriver) {
      throw new BadRequestException('A passenger can only review the driver.');
    }

    if (isDriver && !isReviewingPassenger) {
      throw new BadRequestException('A driver can only review the passenger.');
    }

    // ---------------------------------------------------------
    // 9. Prevent duplicate reviews.
    //
    // The entity also has a database-level unique constraint on:
    // travel + reviewer
    //
    // This application-level check gives the user a clean error.
    // ---------------------------------------------------------
    const existingReview = await this.reviewRepository.findOne({
      where: {
        travel: { id: travelId },
        reviewer: { id: reviewerId },
      },
    });

    if (existingReview) {
      throw new ConflictException('You have already reviewed this travel.');
    }

    // ---------------------------------------------------------
    // 10. Create the review.
    //
    // reviewerId comes from the authenticated user, NOT from
    // the request body.
    // ---------------------------------------------------------
    const review = this.reviewRepository.create({
      reviewer: { id: reviewerId },
      reviewedUser: { id: reviewedUserId },
      travel: { id: travelId },
      rating,
      comment: comment ?? null,
      isAnonymous,
    });

    // ---------------------------------------------------------
    // 11. Save the review.
    // ---------------------------------------------------------
    const savedReview = await this.reviewRepository.save(review);

    return savedReview;
  }
}
