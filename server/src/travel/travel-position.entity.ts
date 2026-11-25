//Stores the calculated vehicle positions:

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

@Entity('travel_positions')
@Index(['travel', 'recordedAt'])
export class TravelPosition {
  // Unique ID for this calculated vehicle position
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The Travel this route position belongs to
  @ManyToOne(() => Travel, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'travelId' })
  travel: Travel;

  // Calculated vehicle latitude
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
  })
  latitude: number;

  // Calculated vehicle longitude
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
  })
  longitude: number;

  // Number of participant GPS readings that
  // contributed to this calculated position.
  @Column()
  participantCount: number;

  // When this vehicle position was calculated
  @CreateDateColumn()
  recordedAt: Date;
}