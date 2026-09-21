import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity.js';

//the state of the drver applcation
export enum DriverApplicationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('driver_applications')
export class DriverApplication {
  @PrimaryGeneratedColumn()
  id: number;

  //just for simplicity wll later change it to 1- 0..*
  // Each driver application belongs to one user.
  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  // New applications start as PENDING.
  @Column({
    type: 'enum',
    enum: DriverApplicationStatus,
    default: DriverApplicationStatus.PENDING,
  })
  status: DriverApplicationStatus;

  @Column()
  licenseNumber: string;

  @Column({ type: 'date' })
  licenseExpiryDate: Date;

  @Column()
  phoneNumber: string;

  @CreateDateColumn()
  submittedAt: Date;

  // Records the actual time an administrator reviews the application.
  // It remains null while the application is still pending.
  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ nullable: true })
  rejectionReason: string;
}
