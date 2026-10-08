import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';

import { Review } from './review.entity.js';
import { User } from '../users/user.entity.js';

@Entity('review_likes')
@Unique(['review', 'user']) // Prevent the same user from liking the same review twice.
export class ReviewLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

    //CASCADE is use on delete so that if a review or a user is deleted all the like will be deleted also from the database
  // The review that was liked.
  @ManyToOne(() => Review, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewId' })
  review: Review;

  // The user who liked the review. can have many likes
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // When the like was created.
  @CreateDateColumn()
  createdAt: Date;
}
