
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { signupDto } from './dto/signup.dto.js';
import { loginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
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
}
