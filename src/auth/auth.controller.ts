
import { Body, Controller, Post, Get, UseGuards, Req} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { signupDto } from './dto/signup.dto.js';
import { loginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from './interfaces/authenticated-request.interface.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '../users/user.entity.js';

@ApiTags('Signup')
@ApiBearerAuth()
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

  // Handles GET /auth/profile.
  // JwtAuthGuard runs BEFORE this methodTherefore, only authenticated users can access it..
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() request: AuthenticatedRequest) {
    return {
      message: 'You are authenticiated',
      user: request.user,
    };
  }
}
