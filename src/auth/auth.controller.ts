
import { Body, Controller, Post, Get, UseGuards, Req} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { signupDto } from './dto/signup.dto.js';
import { loginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from './interfaces/authenticated-request.interface.js';

@Controller('auth')
export class AuthController {
  // Inject AuthService to access authentication methods.
  constructor(private readonly authService: AuthService) {}

  // Handles POST requests sent to /auth/signup.
  // @Body extracts the JSON request body.
  // The DTO describes the expected signup data.
  @Post('signup')
  signup(@Body() signupDto: signupDto) {
    return this.authService.signup(signupDto);
  }

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
      user: request.user
    };
  }
}
