import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { PassengerApplication } from './passenger-application.entity.js';
import { PassengerApplicationController } from './passenger-application.controller.js';
import { PassengerApplicationService } from './passenger-application.service.js';

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

  providers: [PassengerApplicationService],
})
export class PassengerApplicationModule {}
