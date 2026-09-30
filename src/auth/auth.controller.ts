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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '../users/user.entity.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';

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
