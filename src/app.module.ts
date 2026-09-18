import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UserModule } from './users/user.module.js';
import { AuthModule } from './auth/auth.module.js';
import { VehicleModule } from './vehicle/vehicle.module.js';
import { RidesModule } from './rides/rides.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity.js';


export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'car-pool',
    }),

    UserModule,
    AuthModule,
    VehicleModule,
    RidesModule,
    BookingsModule,

    //NestJS module configuration that connect the aplcation to the database
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgresql',
      database: 'CarPool',
      entities: [User],
      synchronize: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
