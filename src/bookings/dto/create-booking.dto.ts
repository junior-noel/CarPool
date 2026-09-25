import { IsInt, IsNotEmpty, IsPositive } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({
    description: 'ID of the ride the passenger wants to book',
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  rideId: number;

  @ApiProperty({
    description: 'Number of seats the passenger wants to reserve',
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  seats: number;
}

// the client only sents the ride ID and the seats
