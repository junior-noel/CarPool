import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Otp } from './otp-entity.js';
import { OtpService } from './otp-service.js';

@Module({
  // Makes the Otp repository available to OtpService.
  imports: [TypeOrmModule.forFeature([Otp])],

  // Registers the OTP service.
  providers: [OtpService],

  // Allows AuthModule to use OtpService.
  exports: [OtpService],
})
export class OtpModule {}
