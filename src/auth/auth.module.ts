import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UserModule } from '../users/user.module.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    // Import UserModule so AuthService can use UsersService.
    UserModule,

    // Provides Passport functionality required by AuthGuard('jwt').
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    // Configure JWT for creating and verifying tokens.
    JwtModule.register({
      // Secret used to sign and verify JWT tokens.
      secret: process.env.JWT_SECRET || 'development_secret_change_me',

      // Token expiration time.
      signOptions: {
        expiresIn: '1d',
      },
    }),
  ],

  // Authentication endpoints.
  controllers: [AuthController],

  // Authentication service and JWT strategy.
  providers: [AuthService, JwtStrategy],

  // Make AuthService available to other modules.
  exports: [AuthService],
})
export class AuthModule {}
