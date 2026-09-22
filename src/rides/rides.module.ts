import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller.js';
import { RidesService } from './rides.service.js';
import { PassportModule } from '@nestjs/passport';
import { Ride } from './ride.entity.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../users/user.module.js';
import { Vehicle } from '../vehicles/vehicle.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, Vehicle]),
    UserModule,
    // Provides Passport configuration required by JwtAuthGuard.
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],

  controllers: [RidesController],
  providers: [RidesService],
})
export class RidesModule {}
