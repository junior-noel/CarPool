import {
  IsNotEmpty,
  IsString,
  Min,
  IsDateString,
  IsInt,
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
}
