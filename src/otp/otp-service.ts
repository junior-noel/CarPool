import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

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
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Creates a new OTP for a specific user and purpose.

  async createOtp(
    user: User,
    purpose: OtpPurpose,
  ): Promise<{ otp: Otp; code: string }> {
    // Invalidate any previous unused OTPs for the same purpose.
    await this.otpRepository.update(
      {
        user: { id: user.id },
        purpose,
        used: false,
      },
      {
        used: true,
      },
    );

    // Generate a new 6-digit OTP.
    const code = this.generateOtpCode();

    // Hash the OTP before storing it.
    const codeHash = await bcrypt.hash(code, 10);

    // OTP will be valid for 10 minutes.
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Create the OTP database record.
    const otp = this.otpRepository.create({
      user,
      codeHash,
      purpose,
      expiresAt,
      attempts: 0,
      used: false,
    });

    // Save the hashed OTP.
    const savedOtp = await this.otpRepository.save(otp);

    // Return both:
    // - savedOtp: database record
    // - code: plain OTP that will be sent to the user
    return {
      otp: savedOtp,
      code,
    };
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
