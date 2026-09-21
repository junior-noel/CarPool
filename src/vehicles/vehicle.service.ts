import { Injectable } from '@nestjs/common';
import {  CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Vehicle } from './vehicle.entity.js';
import { NotFoundException } from '@nestjs/common';
import { UserService } from '../users/user.service.js';
import { User } from '../users/user.entity.js';
import { ExceptionsHandler } from '@nestjs/core/exceptions/exceptions-handler.js';

@Injectable()
export class VehicleService {
  constructor(
    @InjectRepository(Vehicle)
      private readonly vehicleRepository: Repository<Vehicle>,
      private readonly userService: UserService,
  ) {}

  // Creates a new vehicle belonging to the authenticated user.
  async create(
    CreateVehicleDto: CreateVehicleDto,
      userId: number,
    
  ): Promise<Vehicle> {
      // Find the user who is creating the vehicle.
      const owner = await this.userService.findById(userId)
      if (!owner) {
          throw new NotFoundException('User not found');
      }

    const vehicle = this.vehicleRepository.create({
      ...CreateVehicleDto, owner
    });

    return this.vehicleRepository.save(vehicle);
  }
}
