import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { VehicleController } from './vehicle.controller.js';
import { VehicleService } from './vehicle.service.js';
import { Vehicle } from './vehicle.entity.js';
import { Ride } from '../rides/ride.entity.js';
import { UserModule } from '../users/user.module.js';

@Module({
  imports: [
    // Registers the repositories needed by VehicleService.
    TypeOrmModule.forFeature([Vehicle, Ride]),

    UserModule,

    // Provides Passport configuration for JWT authentication.
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],
  controllers: [VehicleController],
  providers: [VehicleService],
})
export class VehicleModule {}