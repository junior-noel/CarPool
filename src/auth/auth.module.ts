import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

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

    // Configure JWT asynchronously so ConfigService can read
    // JWT_SECRET from the .env file before JWT is configured.
    JwtModule.registerAsync({
      imports: [ConfigModule],

      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        // Use the same secret that JwtStrategy uses.
        secret: configService.get<string>('JWT_SECRET'),

        // Token expiration time.
        signOptions: {
          expiresIn: '1d',
        },
      }),
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
