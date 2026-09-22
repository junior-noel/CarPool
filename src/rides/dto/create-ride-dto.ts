import {
  IsNotEmpty,
  IsString,
  Min,
  IsDateString,
  IsNumber,
  IsInt,
} from 'class-validator';

export class CreateRideDto {
  // Place where the ride starts.
  @IsString()
  @IsNotEmpty()
  origin: string;

  // Place where the ride ends.
  @IsString()
  @IsNotEmpty()
  destination: string;

  // Date of the ride.
  // Example: "2026-10-05"
  @IsDateString()
  departureDate: string;

  // Time of the ride.
  // Example: "08:30"
  @IsString()
  @IsNotEmpty()
  departureTime: string;

  // Number of seats the driver makes available
  // for passengers.
  @IsInt()
  @Min(1)
  availableSeats: number;

  // Price charged for one passenger seat.
  @IsNumber()
  @Min(0)
  pricePerSeat: number;

  // Vehicle selected for this ride.
  @IsInt()
  @Min(1)
  vehicleId: number;
}
