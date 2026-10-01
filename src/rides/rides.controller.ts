import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RidesService } from './rides.service.js';
import { CreateRideDto } from './dto/create-ride-dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DriverGuard } from '../auth/guards/driver.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Ride } from './ride.entity.js';
import { SearchRidesDto } from './dto/search-rides.dto.js';

@ApiTags('Rides')
@ApiBearerAuth()
@Controller('rides')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @ApiOperation({
    summary: 'Search bookable rides',
    description:
      'Searches scheduled future rides and returns paginated safe ride, driver, and vehicle details.',
  })
  @ApiQuery({ name: 'origin', required: false, type: String, maxLength: 100 })
  @ApiQuery({
    name: 'destination',
    required: false,
    type: String,
    maxLength: 100,
  })
  @ApiQuery({ name: 'date', required: false, type: String, format: 'date' })
  @ApiQuery({
    name: 'minSeats',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 50,
    example: 1,
  })
  @ApiQuery({
    name: 'maxPricePerSeat',
    required: false,
    type: Number,
    minimum: 0,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    minimum: 1,
    default: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @ApiOkResponse({
    description: 'Paginated bookable rides with only public fields.',
    schema: {
      example: {
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            origin: 'Yaounde Centre',
            destination: 'Douala Bonaberi',
            departureDate: '2026-10-15',
            departureTime: '09:30:00',
            pricePerSeat: 2500,
            availableSeats: 2,
            status: 'scheduled',
            driver: {
              id: '550e8400-e29b-41d4-a716-446655440001',
              firstName: 'Alex',
            },
            vehicle: { model: 'Corolla', color: 'Silver', capacity: 5 },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'One or more search query parameters are invalid.',
  })
  @UseGuards(JwtAuthGuard)
  @Get('search')
  // Any authenticated user may search; no application-role guard is required.
  searchRides(@Query() query: SearchRidesDto) {
    return this.ridesService.search(query);
  }

  @ApiOperation({
    summary: 'create a ride',
    description:
      'Allows approved driver to create a ride for a specific vehicle',
  })
  @ApiCreatedResponse({
    description: 'Ride created successfully',
    type: Ride,
  })
  // Only authenticated users with the driver role
  // can create a ride.
  @UseGuards(JwtAuthGuard, DriverGuard)
  @Post()
  createRide(
    @Body() createRideDto: CreateRideDto,
    @Req() request: AuthenticatedRequest,
  ) {
    // Get the driver's ID from the verified JWT.
    const userId = request.user.userId;

    // Pass the driver ID and ride information
    // to the service for validation and creation.
    return this.ridesService.create(userId, createRideDto);
  }
}
