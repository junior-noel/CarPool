import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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

    @InjectRepository(Travel)
    private readonly travelRepository: Repository<Travel>,

    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,

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

    // A user cannot review themselves.
    if (reviewerId === reviewedUserId) {
      throw new BadRequestException('You cannot review yourself.');
    }

    // ---------------------------------------------------------
    // 1. Find the travel
    // ---------------------------------------------------------
    const travel = await this.travelRepository.findOne({
      where: { id: travelId },
      relations: ['ride', 'ride.driver'],
    });

    if (!travel) {
      throw new NotFoundException('Travel not found.');
    }

    // Reviews are only allowed after the travel has been completed.
    if (travel.status !== TravelStatus.COMPLETED) {
      throw new BadRequestException('You can only review a completed travel.');
    }

    // ---------------------------------------------------------
    // 2. Find the user being reviewed
    // ---------------------------------------------------------
    const reviewedUser = await this.userRepository.findOne({
      where: { id: reviewedUserId },
    });

    if (!reviewedUser) {
      throw new NotFoundException('Reviewed user not found.');
    }

    // The driver is obtained directly from the ride.
    const driverId = travel.ride.driver.id;

    // Determine whether the authenticated user is the driver.
    const isDriver = reviewerId === driverId;

    // We will use this to verify passenger participation.
    let approvedBooking: Booking | null = null;

    // ---------------------------------------------------------
    // 3. Verify that the reviewer participated in the travel
    // ---------------------------------------------------------

    if (isDriver) {
      // -------------------------------------------------------
      // DRIVER → PASSENGER
      // -------------------------------------------------------
      //
      // The driver does not have a booking.
      // Instead, we verify that the person being reviewed has
      // an approved booking on this ride.
      //

      approvedBooking = await this.bookingRepository.findOne({
        where: {
          passenger: { id: reviewedUserId },
          ride: { id: travel.ride.id },
          status: BookingStatus.APPROVED,
        },
        relations: ['passenger'],
      });

      if (!approvedBooking) {
        throw new BadRequestException(
          'The user you are reviewing did not participate in this travel.',
        );
      }
    } else {
      // -------------------------------------------------------
      // PASSENGER → DRIVER
      // -------------------------------------------------------
      //
      // The reviewer must have an approved booking on this ride.
      //

      approvedBooking = await this.bookingRepository.findOne({
        where: {
          passenger: { id: reviewerId },
          ride: { id: travel.ride.id },
          status: BookingStatus.APPROVED,
        },
        relations: ['passenger'],
      });

      if (!approvedBooking) {
        throw new BadRequestException(
          'You did not participate in this travel.',
        );
      }

      // A passenger can only review the driver.
      if (reviewedUserId !== driverId) {
        throw new BadRequestException(
          'A passenger can only review the driver.',
        );
      }
    }

    // ---------------------------------------------------------
    // 4. Make sure the reviewed user is actually a participant
    // ---------------------------------------------------------

    if (isDriver) {
      // If the reviewer is the driver, the reviewed user must
      // be the passenger found through the approved booking.
      if (approvedBooking.passenger.id !== reviewedUserId) {
        throw new BadRequestException(
          'You can only review a passenger who participated in this travel.',
        );
      }
    } else {
      // If the reviewer is the passenger, the reviewed user
      // must already have been verified as the driver above.
      if (reviewedUserId !== driverId) {
        throw new BadRequestException(
          'You can only review the driver of this travel.',
        );
      }
    }

    // ---------------------------------------------------------
    // 5. Prevent duplicate reviews
    // ---------------------------------------------------------
    //
    // One reviewer can review the same user only once for
    // the same travel.
    //
    // This allows:
    //
    // Driver → Passenger A
    // Driver → Passenger B
    //
    // while preventing:
    //
    // Driver → Passenger A
    // Driver → Passenger A   ❌
    //

    const existingReview = await this.reviewRepository.findOne({
      where: {
        travel: { id: travelId },
        reviewer: { id: reviewerId },
        reviewedUser: { id: reviewedUserId },
      },
    });

    if (existingReview) {
      throw new ConflictException(
        'You have already reviewed this user for this travel.',
      );
    }

    // ---------------------------------------------------------
    // 6. Create the review
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
    // 7. Save the review
    // ---------------------------------------------------------

    const savedReview = await this.reviewRepository.save(review);

    return savedReview;
  }
}
