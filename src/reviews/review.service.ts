import {
  BadRequestException,
  ConflictException,
  Injectable,
    NotFoundException,
  ForbiddenException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Review } from './review.entity.js';
import { CreateReviewDto } from './dto/create-review.dto.js';

import { Travel, TravelStatus } from '../travel/travel.entity.js';
import { Booking, BookingStatus } from '../bookings/booking.entity.js';
import { User } from '../users/user.entity.js';
import { ReviewStatus } from './enums/review-status.enum.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { ReviewLike } from './review-like.entity.js';

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

    @InjectRepository(ReviewLike)
    private readonly reviewLikeRepository: Repository<ReviewLike>,
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

  async getReviewsForUser(userId: string) {
    // First make sure the user whose reviews we are requesting exists.
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    // Only visible reviews should be returned to normal users.
    // Hidden and deleted reviews are excluded.
    const reviews = await this.reviewRepository.find({
      where: {
        reviewedUser: { id: userId },
        status: ReviewStatus.VISIBLE,
      },
      relations: ['reviewer', 'reviewedUser', 'travel'],
      order: {
        createdAt: 'DESC',
      },
    });

    // Sanitize the response so anonymous reviewers do not have their identity exposed.
    return reviews.map((review) => {
      const reviewer = review.isAnonymous
        ? null
        : {
            id: review.reviewer.id,
            firstName: review.reviewer.firstName,
            lastName: review.reviewer.lastName,
          };

      return {
        id: review.id,
        reviewer,
        reviewedUser: {
          id: review.reviewedUser.id,
          firstName: review.reviewedUser.firstName,
          lastName: review.reviewedUser.lastName,
        },
        travel: {
          id: review.travel.id,
        },
        rating: review.rating,
        comment: review.comment,
        isAnonymous: review.isAnonymous,
        status: review.status,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      };
    });
  }

  async getReviewsForTravel(travelId: string) {
    // First make sure the travel exists.
    const travel = await this.travelRepository.findOne({
      where: { id: travelId },
    });

    if (!travel) {
      throw new NotFoundException('Travel not found.');
    }

    // Only visible reviews are publicly accessible.
    const reviews = await this.reviewRepository.find({
      where: {
        travel: { id: travelId },
        status: ReviewStatus.VISIBLE,
      },
      relations: ['reviewer', 'reviewedUser', 'travel'],
      order: {
        createdAt: 'DESC',
      },
    });

    // Hide the reviewer's identity when the review is anonymous.
    return reviews.map((review) => {
      const reviewer = review.isAnonymous
        ? null
        : {
            id: review.reviewer.id,
            firstName: review.reviewer.firstName,
            lastName: review.reviewer.lastName,
          };

      return {
        id: review.id,
        reviewer,
        reviewedUser: {
          id: review.reviewedUser.id,
          firstName: review.reviewedUser.firstName,
          lastName: review.reviewedUser.lastName,
        },
        travel: {
          id: review.travel.id,
        },
        rating: review.rating,
        comment: review.comment,
        isAnonymous: review.isAnonymous,
        status: review.status,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      };
    });
  }

  async updateReview(
    reviewId: string,
    reviewerId: string,
    updateReviewDto: UpdateReviewDto,
  ) {
    // Find the review together with its reviewer.
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ['reviewer'],
    });

    if (!review) {
      throw new NotFoundException('Review not found.');
    }

    // Only the person who originally created the review is allowed to edit it.
    if (review.reviewer.id !== reviewerId) {
      throw new ForbiddenException('You can only update your own review.');
    }

    // A deleted review should not be editable.
    if (review.status === ReviewStatus.DELETED) {
      throw new BadRequestException('A deleted review cannot be updated.');
    }

    // Update only the fields that were actually provided.
    if (updateReviewDto.rating !== undefined) {
      review.rating = updateReviewDto.rating;
    }

    if (updateReviewDto.comment !== undefined) {
      review.comment = updateReviewDto.comment;
    }

    if (updateReviewDto.isAnonymous !== undefined) {
      review.isAnonymous = updateReviewDto.isAnonymous;
    }

    // TypeORM's @UpdateDateColumn() automatically updates
    // updatedAt when the entity is saved.
    return this.reviewRepository.save(review);
  }

  async deleteReview(reviewId: string, reviewerId: string) {
    // Find the review together with its original reviewer.
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ['reviewer'],
    });

    if (!review) {
      throw new NotFoundException('Review not found.');
    }

    // Only the user who created the review can delete it.
    if (review.reviewer.id !== reviewerId) {
      throw new ForbiddenException('You can only delete your own review.');
    }

    // Prevent deleting an already deleted review.
    if (review.status === ReviewStatus.DELETED) {
      throw new BadRequestException('This review has already been deleted.');
    }

    // Soft-delete the review.
    review.status = ReviewStatus.DELETED;
    review.deletedAt = new Date();

    return this.reviewRepository.save(review);
  }

  async likeReview(reviewId: string, userId: string) {
    // Make sure the review exists and is not deleted.
    const review = await this.reviewRepository.findOne({
      where: {
        id: reviewId,
      },
      relations: ['reviewer'],
    });

    if (!review) {
      throw new NotFoundException('Review not found.');
    }

    // Deleted reviews cannot be liked.
    if (review.status === ReviewStatus.DELETED) {
      throw new BadRequestException('Deleted reviews cannot be liked.');
    }

    // A user cannot like their own review.
    if (review.reviewer.id === userId) {
      throw new BadRequestException('You cannot like your own review.');
    }

    // Check whether this user has already liked the review.
    const existingLike = await this.reviewLikeRepository.findOne({
      where: {
        review: { id: reviewId },
        user: { id: userId },
      },
    });

    if (existingLike) {
      throw new ConflictException('You have already liked this review.');
    }

    // Create the like.
    const like = this.reviewLikeRepository.create({
      review,
      user: { id: userId } as User,
    });

    await this.reviewLikeRepository.save(like);

    return {
      message: 'Review liked successfully.',
    };
  }

  async unlikeReview(reviewId: string, userId: string) {
    // Find the user's like for this review.
    const like = await this.reviewLikeRepository.findOne({
      where: {
        review: { id: reviewId },
        user: { id: userId },
      },
    });

    if (!like) {
      throw new NotFoundException('Like not found.');
    }

    // Remove the like.
    await this.reviewLikeRepository.remove(like);

    return {
      message: 'Review unliked successfully.',
    };
  }
}
