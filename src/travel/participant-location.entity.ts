//Stores the raw GPS observations:

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

import { Travel } from './travel.entity.js';
import { User } from '../users/user.entity.js';

@Entity('participant_locations')
@Index(['travel', 'participant', 'recordedAt'])
export class ParticipantLocation {
  // Unique ID for this GPS observation
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The Travel this location belongs to
  @ManyToOne(() => Travel, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'travelId' })
  travel: Travel;

  // The participant who sent this GPS location.
  // This can be the driver or a passenger.
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participantId' })
  participant: User;

  // GPS latitude
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
  })
  latitude: number;

  // GPS longitude
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
  })
  longitude: number;

  // Estimated GPS accuracy in meters,
  // normally provided by the participant's device.
  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
  })
  accuracy: number;

  // When this GPS reading was recorded
  @CreateDateColumn()
  recordedAt: Date;
}
