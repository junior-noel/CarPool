import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity.js';

 //Represents the current state of a passenger's ride request.
export enum RideRequestStatus {
  OPEN = 'open',
  ACCEPTED = 'accepted',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Entity('ride_requests')
export class RideRequest {
  
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  origin: string;

  @Column()
  destination: string;

  @Column({
    type: 'date',
  })
  departureDate: Date;

  @Column({
    type: 'time',
  })
  preferredTime: string;

  @Column()
  seatsNeeded: number;

  // Current state of the request.New requests start as OPEN.
  @Column({
    type: 'enum',
    enum: RideRequestStatus,
    default: RideRequestStatus.OPEN,
  })
  status: RideRequestStatus;

  // Passenger who created the request.A request must always belong to a user.

  @ManyToOne(() => User, {
    nullable: false,
  })
  passenger: User;

  // Driver who accepted the request.This is nullable because a newly-created request does not have a driver yet.
  @ManyToOne(() => User, {
    nullable: true,
  })
  driver: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
