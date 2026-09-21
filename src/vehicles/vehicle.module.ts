import { Module } from '@nestjs/common';
import { VehicleController } from './vehicle.controller.js';
import { VehicleService } from './vehicle.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../users/user.module.js';
import { Vehicle } from './vehicle.entity.js';

@Module({
  imports: [
        // Makes the Vehicle repository available to VehicleService.
    TypeOrmModule.forFeature([Vehicle]),
    UserModule,
  ],
  controllers: [VehicleController],
  providers: [VehicleService],
})
export class VehicleModule {}
