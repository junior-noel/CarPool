import {
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  CreateDateColumn,
  Entity,
  ManyToOne,
} from 'typeorm';

import { Vehicle } from '../vehicles/vehicle.entity.js';
import { User } from '../users/user.entity.js';

// Represents the current state of a ride.
export enum RideStatus {
  SCHEDULED = 'scheduled',
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('ride')
export class Ride {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  totalSeat: number;

  @Column()
  availableSeat: number;

  @Column()
  origin: string;

  @Column()
  destination: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  seatPerPrice: number;

  @Column({
    type: 'time',
  })
  departureTime: string;

  // Date on which the ride departs.
  @Column({
    type: 'date',
  })
  departureDate: Date;

  // The current status of the ride.
  @Column({
    type: 'enum',
    enum: RideStatus,
    default: RideStatus.SCHEDULED,
  })
  status: RideStatus;

  @ManyToOne(() => Vehicle, {
    nullable: false,
  })
  vehicle: Vehicle;

  @ManyToOne(() => User, {
    nullable: false,
  })
  driver: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
