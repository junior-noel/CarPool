import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ApiProperty } from '@nestjs/swagger';

import { User } from '../users/user.entity.js';
import { Ride } from '../rides/ride.entity.js';

/**
 * Represents the current state of a booking.
 *
 * PENDING   → Passenger has requested seats and is waiting for the driver.
 * APPROVED  → Driver accepted the booking.
 * REJECTED  → Driver rejected the booking.
 * CANCELLED → Booking was cancelled.
 */
export enum BookingStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Entity('bookings')
export class Booking {
  @ApiProperty({
    description: 'Unique identifier of the booking',
  })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    description: 'Number of seats requested by the passenger',
    minimum: 1,
  })
  @Column()
  seats: number;

  @ApiProperty({
    description: 'Total price for all requested seats',
  })
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  totalPrice: number;

  @ApiProperty({
    description: 'Current status of the booking',
    enum: BookingStatus,
    example: BookingStatus.PENDING,
  })
  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;
   
    // A user can have many bookings.
  @ApiProperty({
    description: 'Passenger who created the booking',
    type: () => User,
  })
  @ManyToOne(() => User, {
    nullable: false,
  })
  passenger: User;

// A ride can have many bookings.
  @ApiProperty({
    description: 'Ride being booked',
    type: () => Ride,
  })
  @ManyToOne(() => Ride, {
    nullable: false,
  })
  ride: Ride;

  @ApiProperty({
    description: 'Date and time when the booking was created',
  })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({
    description: 'Date and time when the booking was last updated',
  })
  @UpdateDateColumn()
  updatedAt: Date;
}
