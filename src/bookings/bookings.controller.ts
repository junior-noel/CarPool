import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Booking')
    @ApiBearerAuth()
@Controller('bookings')
export class BookingsController {}
