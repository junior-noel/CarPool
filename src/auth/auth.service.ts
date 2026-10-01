import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UserService } from '../users/user.service.js';
import { signupDto } from './dto/signup.dto.js';
import { User } from '../users/user.entity.js';
import { loginDto } from './dto/login.dto.js';
import { Logger } from '@nestjs/common';

import { OtpService } from '../otp/otp-service.js';
import { OtpPurpose } from '../otp/otp-purpose.enum.js';
import { EmailService } from '../email/email.service.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

const INVALID_VERIFICATION_MESSAGE = 'Invalid or expired verification code.';
const NEUTRAL_RESEND_RESPONSE = {
  message: 'If the account needs verification, a code will be sent.',
};
const NEUTRAL_FORGOT_PASSWORD_RESPONSE = {
  message: 'If the account is eligible, a password reset code will be sent.',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    // Inject UsersService so we can access user-related database operations.
    private readonly usersService: UserService,
    // Inject JwtService so we can generate JWT access tokens during login.
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
  ) {}

  //function to signup new user
  async signup(signupDto: signupDto) {
    const { firstName, lastName, email, phoneNumber, password } = signupDto;

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new BadRequestException(
        'This user is already existing. Thry to login instead',
      );
    }

    //try {
    // Create and save the user in the PostgreSQL database.
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.usersService.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      // Save the hashed password
      password: hashedPassword,
      // Assign the default role from the backend.
      role: 'user',
    });

    // Save the OTP only after email delivery so failed signup sends do not count.
    const { otp, code } = await this.otpService.prepareOtp(
      user,
      OtpPurpose.EMAIL_VERIFICATION,
    );

    // Send the OTP to the user's email address.
    await this.emailService.sendOtpEmail(
      user.email,
      code,
      OtpPurpose.EMAIL_VERIFICATION,
    );
    await this.otpService.persistOtp(otp);

    // Return a success message and the user information without the password.
    return {
      message:
        'Registration successful. Please check your email for the verification code.',
      user: this.sanitizeUser(user),
    };
    // } catch (e) {
    //   this.logger.error('User creation failed', e);
    //   throw new BadRequestException('Could not register user');
    // }
  }

  async verifyEmail(verifyOtpDto: VerifyOtpDto) {
    const user = await this.usersService.findByEmail(verifyOtpDto.email);

    if (!user) {
      this.logger.warn('Email verification rejected: user not found');
      throw new BadRequestException(INVALID_VERIFICATION_MESSAGE);
    }

    if (user.emailVerified) {
      this.logger.warn('Email verification rejected: email already verified');
      throw new BadRequestException(INVALID_VERIFICATION_MESSAGE);
    }

    try {
      await this.otpService.verifyOtp(
        user,
        verifyOtpDto.otp,
        OtpPurpose.EMAIL_VERIFICATION,
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        this.logger.warn(`Email verification rejected: ${error.message}`);
        throw new BadRequestException(INVALID_VERIFICATION_MESSAGE);
      }

      throw error;
    }

    await this.usersService.markEmailVerified(user.id);

    return { message: 'Email verified successfully.' };
  }

  // Apply account limits while keeping each account-level outcome indistinguishable.
  async resendVerification(resendOtpDto: ResendOtpDto) {
    const user = await this.usersService.findByEmail(resendOtpDto.email);

    if (!user) {
      this.logger.warn('Verification resend skipped: account not found');
      return NEUTRAL_RESEND_RESPONSE;
    }

    if (user.emailVerified) {
      this.logger.warn('Verification resend skipped: account already verified');
      return NEUTRAL_RESEND_RESPONSE;
    }

    const latestOtp = await this.otpService.findLatestForUserAndPurpose(
      user.id,
      OtpPurpose.EMAIL_VERIFICATION,
    );

    // Persisted OTP time records the most recent successful SMTP handoff.
    if (latestOtp && Date.now() - latestOtp.createdAt.getTime() < 60 * 1000) {
      this.logger.warn('Verification resend skipped: account cooldown active');
      return NEUTRAL_RESEND_RESPONSE;
    }

    const hourlyCount = await this.otpService.countCreatedSince(
      user.id,
      OtpPurpose.EMAIL_VERIFICATION,
      new Date(Date.now() - 60 * 60 * 1000),
    );

    if (hourlyCount >= 5) {
      this.logger.warn(
        'Verification resend skipped: account hourly cap reached',
      );
      return NEUTRAL_RESEND_RESPONSE;
    }

    const { otp, code } = await this.otpService.prepareOtp(
      user,
      OtpPurpose.EMAIL_VERIFICATION,
    );

    try {
      await this.emailService.sendOtpEmail(
        user.email,
        code,
        OtpPurpose.EMAIL_VERIFICATION,
      );
    } catch {
      // EmailService logs the SMTP detail; don't expose it or save/count this OTP.
      this.logger.warn('Verification resend skipped: email delivery failed');
      return NEUTRAL_RESEND_RESPONSE;
    }

    await this.otpService.persistOtp(otp);
    return NEUTRAL_RESEND_RESPONSE;
  }

  // Request a password-reset OTP without exposing account eligibility.
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(forgotPasswordDto.email);

    if (!user) {
      this.logger.warn('Password reset request skipped: account not found');
      return NEUTRAL_FORGOT_PASSWORD_RESPONSE;
    }

    if (!user.emailVerified) {
      this.logger.warn('Password reset request skipped: email not verified');
      return NEUTRAL_FORGOT_PASSWORD_RESPONSE;
    }

    const purpose = OtpPurpose.PASSWORD_RESET;
    const latestOtp = await this.otpService.findLatestForUserAndPurpose(
      user.id,
      purpose,
    );

    // Only persisted password-reset OTPs start this purpose's cooldown.
    if (latestOtp && Date.now() - latestOtp.createdAt.getTime() < 60 * 1000) {
      this.logger.warn(
        'Password reset request skipped: account cooldown active',
      );
      return NEUTRAL_FORGOT_PASSWORD_RESPONSE;
    }

    const hourlyCount = await this.otpService.countCreatedSince(
      user.id,
      purpose,
      new Date(Date.now() - 60 * 60 * 1000),
    );

    if (hourlyCount >= 5) {
      this.logger.warn(
        'Password reset request skipped: account hourly cap reached',
      );
      return NEUTRAL_FORGOT_PASSWORD_RESPONSE;
    }

    const { otp, code } = await this.otpService.prepareOtp(user, purpose);

    try {
      await this.emailService.sendOtpEmail(user.email, code, purpose);
    } catch {
      // EmailService logs SMTP details; do not save an undelivered reset code.
      this.logger.warn('Password reset request skipped: email delivery failed');
      return NEUTRAL_FORGOT_PASSWORD_RESPONSE;
    }

    await this.otpService.persistOtp(otp);
    return NEUTRAL_FORGOT_PASSWORD_RESPONSE;
  }

  // Reset a verified account password using only its password-reset-purpose OTP.
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.usersService.findByEmail(resetPasswordDto.email);

    if (!user) {
      this.logger.warn('Password reset rejected: account not found');
      throw new BadRequestException(INVALID_VERIFICATION_MESSAGE);
    }

    if (!user.emailVerified) {
      this.logger.warn('Password reset rejected: email not verified');
      throw new BadRequestException(INVALID_VERIFICATION_MESSAGE);
    }

    try {
      await this.otpService.verifyOtp(
        user,
        resetPasswordDto.otp,
        OtpPurpose.PASSWORD_RESET,
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        this.logger.warn(`Password reset rejected: ${error.message}`);
        throw new BadRequestException(INVALID_VERIFICATION_MESSAGE);
      }

      throw error;
    }

    const passwordHash = await bcrypt.hash(resetPasswordDto.newPassword, 10);
    await this.usersService.updatePassword(user.id, passwordHash);
    await this.otpService.invalidateUnusedForUserAndPurpose(
      user.id,
      OtpPurpose.PASSWORD_RESET,
    );

    return { message: 'Password reset successfully. Please log in.' };
  }

  // This method handles user login.
  async login(loginDto: loginDto) {
    // Extract the email and password submitted by the user.
    const { email, password } = loginDto;
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Compare the plain-text password from the request
    // with the hashed password stored in the database.
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check verification only after valid credentials, avoiding account discovery by email alone.
    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email before logging in.',
      );
    }

    // These values will be stored inside the JWT payload.
    const payload = {
      // "sub" means subject and identifies the user.
      sub: user.id,

      // Store the user's email in the token.
      email: user.email,

      // Store the user's role in the token.
      role: user.role,
    };

    // Generate a signed JWT access token.
    const accessToken = await this.jwtService.signAsync(payload);

    // Remove the password before returning the user information.
    const { password: _, deletedAt: del, ...userWithoutPassword } = user;

    // Return the token and safe user information to the client.
    return {
      message: 'Login successful',
      accessToken,
      user: userWithoutPassword,
    };
  }

  private sanitizeUser(user: any) {
    if (!user) {
      return user;
    }

    // Extract the password and keep everything else.
    const { password, ...safeUser } = user;

    return safeUser;
  }
}
