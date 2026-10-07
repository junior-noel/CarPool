import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ReviewService } from './review.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@ApiTags('Reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Create a review',
    description:
      'Allows a passenger to review a driver or a driver to review a passenger after a completed travel.',
  })
  @ApiResponse({
    status: 201,
    description: 'Review created successfully.',
  })
  @ApiResponse({
    status: 400,
    description:
      'The travel is not completed, the user did not participate, or the reviewed user is not a valid participant.',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication is required.',
  })
  @ApiResponse({
    status: 404,
    description: 'Travel or reviewed user was not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'The user has already reviewed this travel.',
  })
  async createReview(
    @Req() req: AuthenticatedRequest,
    @Body() createReviewDto: CreateReviewDto,
  ) {
    // The reviewer is taken from the authenticated JWT.
    return this.reviewService.createReview(req.user.userId, createReviewDto);
  }
}
