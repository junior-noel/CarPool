import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity.js';

/**
 * Represents the different stages of a passenger application.
 */
export enum PassengerApplicationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('passenger_applications')
export class PassengerApplication {
 
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  @Column({
    type: 'enum',
    enum: PassengerApplicationStatus,
    default: PassengerApplicationStatus.PENDING,
  })
  status: PassengerApplicationStatus;

  @Column()
  phoneNumber: string;

  /**
   * Identification number submitted by the applicant.
   */
  @Column()
  identificationNumber: string;

  /**
   * Type of identification document.
   *
   * Examples:
   * - National ID
   * - Passport
   * - Driver's license
   */
  @Column()
  identificationType: string;

  @CreateDateColumn()
  submittedAt: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  reviewedAt: Date | null;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  rejectionReason: string | null;
}
