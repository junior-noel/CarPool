import { Module } from '@nestjs/common';
import { VehicleController } from './vehicle.controller.js';
import { VehicleService } from './vehicle.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../users/user.module.js';
import { Vehicle } from './vehicle.entity.js';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [
    // Makes the Vehicle repository available to VehicleService.
    TypeOrmModule.forFeature([Vehicle]),
    UserModule,
    // Provides the Passport configuration required by JwtAuthGuard.
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],
  controllers: [VehicleController],
  providers: [VehicleService],
})
export class VehicleModule {}
