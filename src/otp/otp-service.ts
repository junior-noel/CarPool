import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';

import { Otp } from './otp-entity.js';
import { OtpPurpose } from './otp-purpose.enum.js';
import { User } from '../users/user.entity.js';

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(Otp)
    private readonly otpRepository: Repository<Otp>,
  ) {}

  // Generates a random 6-digit OTP.
  private generateOtpCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  // Creates a new OTP for a specific user and purpose.

  async createOtp(
    user: User,
    purpose: OtpPurpose,
  ): Promise<{ otp: Otp; code: string }> {
    const { otp, code } = await this.prepareOtp(user, purpose);
    return {
      otp: await this.persistOtp(otp),
      code,
    };
  }

  // Prepare a hashed OTP without saving it, so delivery can happen first.
  async prepareOtp(
    user: User,
    purpose: OtpPurpose,
  ): Promise<{ otp: Otp; code: string }> {
    const code = this.generateOtpCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const otp = this.otpRepository.create({
      user,
      codeHash,
      purpose,
      expiresAt,
      attempts: 0,
      used: false,
    });

    return { otp, code };
  }

  // Save a delivered OTP and invalidate earlier unused codes for that purpose.
  async persistOtp(otp: Otp): Promise<Otp> {
    // Invalidate any previous unused OTPs for the same purpose.
    await this.otpRepository.update(
      {
        user: { id: otp.user.id },
        purpose: otp.purpose,
        used: false,
      },
      {
        used: true,
      },
    );

    return this.otpRepository.save(otp);
  }

  // Find the newest OTP to calculate a user's resend cooldown.
  async findLatestForUserAndPurpose(
    userId: string,
    purpose: OtpPurpose,
  ): Promise<Otp | null> {
    return this.otpRepository.findOne({
      where: { user: { id: userId }, purpose },
      order: { createdAt: 'DESC' },
    });
  }

  // Count delivered OTP records within the rolling-hour limit window.
  async countCreatedSince(
    userId: string,
    purpose: OtpPurpose,
    since: Date,
  ): Promise<number> {
    return this.otpRepository.count({
      where: {
        user: { id: userId },
        purpose,
        createdAt: MoreThanOrEqual(since),
      },
    });
  }

  // Verifies an OTP submitted by a user.

  async verifyOtp(
    user: User,
    code: string,
    purpose: OtpPurpose,
  ): Promise<boolean> {
    // Find the latest unused OTP for this user and purpose.
    const otp = await this.otpRepository.findOne({
      where: {
        user: { id: user.id },
        purpose,
        used: false,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    // No OTP exists.
    if (!otp) {
      throw new BadRequestException(
        'No valid OTP was found. Please request a new OTP.',
      );
    }

    // Check whether the OTP has expired.
    if (otp.expiresAt.getTime() < Date.now()) {
      otp.used = true;
      await this.otpRepository.save(otp);

      throw new BadRequestException(
        'This OTP has expired. Please request a new OTP.',
      );
    }

    // Prevent unlimited incorrect attempts.
    if (otp.attempts >= 5) {
      otp.used = true;
      await this.otpRepository.save(otp);

      throw new ConflictException(
        'Too many incorrect attempts. Please request a new OTP.',
      );
    }

    // Compare the submitted OTP with the stored hash.
    const isValid = await bcrypt.compare(code, otp.codeHash);

    // If the OTP is incorrect, increase the attempt counter.
    if (!isValid) {
      otp.attempts += 1;
      await this.otpRepository.save(otp);

      throw new BadRequestException('Invalid OTP.');
    }

    // The OTP is correct, so make it unusable.
    otp.used = true;
    await this.otpRepository.save(otp);

    return true;
  }
}
