import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity.js';
import { Ride } from '../rides/ride.entity.js';

/**
 * Current state of a Travel (the actual journey behind a ride).
 *
 * This step only ever creates travels as IN_PROGRESS. COMPLETED and CANCELLED
 * exist now so the database enum is complete, but are set by later steps.
 */
export enum TravelStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// The Travel is the driver's actual journey for a ride. A ride has at most one
// Travel, enforced by the unique FK on this side of the relationship.
@Entity('travels')
export class Travel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: TravelStatus,
    default: TravelStatus.IN_PROGRESS,
  })
  status: TravelStatus;

  // When the driver started the journey. Stored with timezone awareness.
  @Column({
    type: 'timestamptz',
  })
  startedAt: Date;

  // Copied from the ride at start time so the travel is stable even if the
  // ride's route fields are ever edited.
  @Column()
  origin: string;

  @Column()
  destination: string;

  // The driver who started the journey.
  @OneToOne(() => User)
  driver: User;

  // The single ride this travel belongs to. Unique so a ride cannot have two.
  @OneToOne(() => Ride, {
    nullable: false,
  })
  @JoinColumn({ name: 'rideId' })
  @Index({ unique: true })
  ride: Ride;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}