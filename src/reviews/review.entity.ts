import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity.js';
import { Travel } from '../travel/travel.entity.js';
import { ReviewStatus } from './enums/review-status.enum.js';

@Entity('reviews')
@Unique(['travel', 'reviewer', 'reviewedUser'])
export class Review {
  // Unique identifier for the review.
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The user who wrote the review.
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'reviewerId' })
  reviewer: User;

  // The user being reviewed.
  //
  // This allows both:Passenger → Driver and Driver → Passenger
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'reviewedUserId' })
  reviewedUser: User;

  // The completed Travel that this review belongs to.
  // A user can only review another participant once for the same Travel.
  @ManyToOne(() => Travel, { nullable: false })
  @JoinColumn({ name: 'travelId' })
  travel: Travel;

  // Rating given by the reviewer.
  // The service/DTO will enforce the valid range of 1–5.
  @Column({ type: 'int' })
  rating: number;

  // Optional written feedback.
  @Column({ type: 'text', nullable: true })
  comment: string | null;

  // Determines whether the reviewer's identity should be hidden from normal users when the review is returned.
  @Column({ default: false })
  isAnonymous: boolean;

  // Controls the visibility/lifecycle state of the review.
  @Column({
    type: 'enum',
    enum: ReviewStatus,
    default: ReviewStatus.VISIBLE,
  })
  status: ReviewStatus;

  // When the review was created.
  @CreateDateColumn()
  createdAt: Date;

  // Automatically updated whenever the review changes.
  @UpdateDateColumn()
  updatedAt: Date;

  // Used for soft deletion.
  // DELETE /reviews/:id will set this value instead of physically removing the review from the database.
  @DeleteDateColumn()
  deletedAt: Date | null;
}
