import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { RideRequest } from './ride-request.entity.js';
import { RideRequestController } from './ride-request.controller.js';
import { RideRequestService } from './ride-request.service.js';

import { UserModule } from '../users/user.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RideRequest]),

    // Allows us to use the authenticated user's JWT when working with this feature.
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    // Gives RideRequestService access to UserService.
    UserModule,
  ],

  controllers: [RideRequestController],
  providers: [RideRequestService],
})
export class RideRequestModule {}