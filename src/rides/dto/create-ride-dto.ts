import {
  IsNotEmpty,
  IsString,
  Min,
  IsDateString,
  IsNumber,
  IsInt,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateRideDto {
  @ApiProperty({
    description: 'Starting location of the ride',
  })
  @IsString()
  @IsNotEmpty()
  origin: string;

  @ApiProperty({
    description: 'Place where the ride ends.',
  })
  @IsString()
  @IsNotEmpty()
  destination: string;

  @ApiProperty({
    description: 'Date on which the ride will depart',
    example: '2026-10-15',
    format: 'date',
  })
  @IsDateString()
  departureDate: string;

  @ApiProperty({
    description: 'Departure time of the ride',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'Departure time must use HH:mm or HH:mm:ss format',
  })
  departureTime: string;

  @ApiProperty({
    description: 'Number of passenger seats available for the ride',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  availableSeats: number;

  @ApiProperty({
    description: ' Price charged for one passenger seat.',
  })
  @IsNumber()
  @Min(0)
  pricePerSeat: number;

  @ApiProperty({
    description: 'Vehicle selected for this ride.',
    minimum: 1,
  })
  @ApiProperty({
    description: 'ID of the vehicle that will be used for the ride',
    minimum: 1,
  })
  @IsUUID()
  vehicleId: string;
}
