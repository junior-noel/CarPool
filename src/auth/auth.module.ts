import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../users/user.module.js';

@Module({
  imports: [
    // Import UsersModule so AuthService can use UsersService.
    UserModule,

    // Configure JWT for generating authentication tokens.
    JwtModule.register({
      // Use the JWT_SECRET from the environment variables.
      // The fallback value is only suitable for development.
      secret: process.env.JWT_SECRET || 'development_secret_change_me',

      // Configure the token expiration time.
      // The token will expire after one day.
      signOptions: {
        expiresIn: '1d',
      },
    }),
  ],

  // Register the controller responsible for authentication routes.
  controllers: [AuthController],
  // Register the service containing signup and login logic.
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
