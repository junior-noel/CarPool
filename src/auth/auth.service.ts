import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
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

const INVALID_VERIFICATION_MESSAGE = 'Invalid or expired verification code.';

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

    // Generate a verification OTP for the newly created user.
    const { code } = await this.otpService.createOtp(
      user,
      OtpPurpose.EMAIL_VERIFICATION,
    );

    // Send the OTP to the user's email address.
    await this.emailService.sendOtpEmail(
      user.email,
      code,
      OtpPurpose.EMAIL_VERIFICATION,
    );

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
