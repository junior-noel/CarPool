import {
  IsNotEmpty,
  IsString,
  Min,
  IsDateString,
  IsInt,
  IsOptional,
} from 'class-validator';

export class CreateRideRequestDto {
  @IsString()
  @IsNotEmpty()
  origin: string;

  @IsString()
  @IsNotEmpty()
  destination: string;

  @IsDateString()
  departureDate: string;

  @IsString()
  @IsNotEmpty()
  preferredTime: string;

  @IsInt()
  @Min(1)
  seatsNeeded: number;

  // Optional:
  // If provided, the passenger is requesting a specific existing ride.
  // If omitted, this is a general request for a driver to fulfill.
  @IsOptional()
  @IsInt()
  @Min(1)
  rideId?: number;
}
