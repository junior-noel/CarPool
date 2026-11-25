import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { PassengerApplication } from './passenger-application.entity.js';
import { PassengerApplicationController } from './passenger-application.controller.js';
import { PassengerApplicationService } from './passenger-application.service.js';
import { PassengerGuard } from './guards/passenger.guard.js';

import { UserModule } from '../users/user.module.js';

@Module({
  imports: [
    // Gives PassengerApplicationService access to the PassengerApplication repository.
    TypeOrmModule.forFeature([PassengerApplication]),

    // Allows us to work with JWT authentication.
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    UserModule,
  ],

  controllers: [PassengerApplicationController],
  providers: [PassengerApplicationService, PassengerGuard],
  exports: [PassengerApplicationService, PassengerGuard],
})
export class PassengerApplicationModule {}
