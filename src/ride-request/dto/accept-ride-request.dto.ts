import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AcceptRideRequestDto {
  @ApiPropertyOptional({
    description: 'Required only when accepting an unlinked request.',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  rideId?: string;
}
