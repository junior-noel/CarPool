import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../users/user.entity.js';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  make: string;

  @Column()
  model: string;

  @Column()
  year: number;

  // Vehicle registration/license plate. It should identify the vehicle uniquely.
  @Column({ unique: true })
  licensePlate: string;

  @Column()
  color: string;

  @Column()
  seats: number;

  // The user who owns this vehicle. Many vehicles can belong to one user.
  @ManyToOne(() => User)
  owner: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}