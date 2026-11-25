import { PartialType } from '@nestjs/mapped-types';
import { CreateRideDto } from './create-ride-dto.js';

// Ride updates reuse the same validation rules but allow fields to be omitted.
export class UpdateRideDto extends PartialType(CreateRideDto) {}
