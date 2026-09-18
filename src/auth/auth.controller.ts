import { Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Controller ('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup() {
    
  }

  @Post('login')
  login() {
    return this.authService.login();
  }
}
