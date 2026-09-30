import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../users/user.entity.js';
import { OtpPurpose } from './otp-purpose.enum.js';

@Entity('otps')
export class Otp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The user this OTP belongs to.
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  @Column()
  codeHash: string;

  // Explains why this OTP was generated.
  @Column({
    type: 'enum',
    enum: OtpPurpose,
  })
  purpose: OtpPurpose;

  // The exact date/time when this OTP becomes invalid.
  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: 0 })
  attempts: number;

  // Prevents the same OTP from being reused after successful verification.
  @Column({ default: false })
  used: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
