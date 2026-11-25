import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverApplicationController } from './driver-application.controller.js';
import { DriverApplicationService } from './driver-application.service.js';
import { DriverApplication } from './driver-application.entity.js';
import { UserModule } from '../users/user.module.js';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [
    // Provides the DriverApplication repository.
    TypeOrmModule.forFeature([DriverApplication]),
    //provde userservce to drverApplcatonServce
    UserModule,
        // Provides Passport configuration required by JwtAuthGuard.
        PassportModule.register({
        defaultStrategy: 'jwt,'
    })
  ],

  controllers: [DriverApplicationController],
  providers: [DriverApplicationService],
})
export class DriverApplicationModule {}