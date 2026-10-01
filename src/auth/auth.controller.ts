import {
  Body,
  Controller,
  Post,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { signupDto } from './dto/signup.dto.js';
import { loginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from './interfaces/authenticated-request.interface.js';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTooManyRequestsResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { User } from '../users/user.entity.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

@ApiTags('Signup')
@Controller('auth')
export class AuthController {
  // Inject AuthService to access authentication methods.
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Create an account',
    description: 'Allows users to create an account.',
  })
  @ApiCreatedResponse({
    description: 'acount successfully created',
    type: User,
  })
  // Handles POST requests sent to /auth/signup.
  @Post('signup')
  signup(@Body() signupDto: signupDto) {
    return this.authService.signup(signupDto);
  }

  @ApiOperation({
    summary: 'Login into your account',
    description: 'Allows users to Login into thier account.',
  })
  @ApiOkResponse({
    description: 'Login successfully',
    type: User,
  })
  @ApiForbiddenResponse({
    description: 'Please verify your email before logging in.',
  })
  // Handles POST requests sent to /auth/login.
  @Post('login')
  login(@Body() loginDto: loginDto) {
    // Pass the login data to AuthService for verification.
    return this.authService.login(loginDto);
  }

  @ApiOperation({
    summary: 'Verify email address',
    description: 'Verifies an email address using its email-verification OTP.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'otp'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'user@example.com',
        },
        otp: {
          type: 'string',
          minLength: 6,
          maxLength: 6,
          example: '012345',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Email verified successfully.',
    schema: {
      example: { message: 'Email verified successfully.' },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired verification code.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  verifyEmail(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyEmail(verifyOtpDto);
  }

  @ApiOperation({
    summary: 'Resend email verification code',
    description:
      'Requests a verification code without disclosing account status.',
  })
  @ApiOkResponse({
    description:
      'The same response is returned for every account-level outcome.',
    schema: {
      example: {
        message: 'If the account needs verification, a code will be sent.',
      },
    },
  })
  @ApiTooManyRequestsResponse({
    description: 'The client IP exceeded the resend request limit.',
  })
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  // Resend only verification codes and keep account-level outcomes private.
  resendVerification(@Body() resendOtpDto: ResendOtpDto) {
    return this.authService.resendVerification(resendOtpDto);
  }

  @ApiOperation({
    summary: 'Request a password reset code',
    description:
      'Requests a password-reset code without disclosing account eligibility.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({
    description:
      'The same response is returned for every account-level outcome.',
    schema: {
      example: {
        message:
          'If the account is eligible, a password reset code will be sent.',
      },
    },
  })
  @ApiTooManyRequestsResponse({
    description: 'The client IP exceeded the password-reset request limit.',
  })
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  // Handle a public request without revealing whether the account can reset its password.
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @ApiOperation({
    summary: 'Reset account password',
    description:
      'Resets a verified account password with its password-reset-purpose OTP.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({
    description: 'Password reset successfully. Please log in.',
    schema: {
      example: { message: 'Password reset successfully. Please log in.' },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired verification code.',
  })
  @ApiTooManyRequestsResponse({
    description: 'The client IP exceeded the password-reset request limit.',
  })
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  // Keep reset requests public while applying the password-reset IP limit.
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  // Handles GET /auth/profile.
  // JwtAuthGuard runs BEFORE this methodTherefore, only authenticated users can access it..
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() request: AuthenticatedRequest) {
    return {
      message: 'You are authenticiated',
      user: request.user,
    };
  }
}
