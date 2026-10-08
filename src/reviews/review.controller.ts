import {
  Body,
  Controller,
  Post,
  Req,
  Get,
  Param,
    UseGuards,
  Patch,
  Delete
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiParam } from '@nestjs/swagger';
import { UpdateReviewDto } from './dto/update-review.dto.js';

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

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get reviews for a user',
    description:
      'Returns visible reviews received by the specified user. Hidden and deleted reviews are excluded.',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID of the user whose reviews should be retrieved',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Visible reviews retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  async getReviewsForUser(@Param('userId') userId: string) {
    return this.reviewService.getReviewsForUser(userId);
  }

  @Get('travel/:travelId')
  @ApiOperation({
    summary: 'Get reviews for a travel',
    description:
      'Returns visible reviews associated with the specified completed travel.',
  })
  @ApiParam({
    name: 'travelId',
    description: 'ID of the travel',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Visible travel reviews retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Travel not found.',
  })
  async getReviewsForTravel(@Param('travelId') travelId: string) {
    return this.reviewService.getReviewsForTravel(travelId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update a review',
    description:
      'Allows the original reviewer to update their rating, comment, or anonymous setting.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID of the review to update',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Review updated successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication is required.',
  })
  @ApiResponse({
    status: 403,
    description: 'Only the original reviewer can update this review.',
  })
  @ApiResponse({
    status: 404,
    description: 'Review not found.',
  })
  async updateReview(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() updateReviewDto: UpdateReviewDto,
  ) {
    return this.reviewService.updateReview(
      id,
      req.user.userId,
      updateReviewDto,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Delete a review',
    description:
      'Soft-deletes a review. Only the original reviewer can delete their review.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID of the review to delete',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Review deleted successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication is required.',
  })
  @ApiResponse({
    status: 403,
    description: 'Only the original reviewer can delete this review.',
  })
  @ApiResponse({
    status: 404,
    description: 'Review not found.',
  })
  async deleteReview(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviewService.deleteReview(id, req.user.userId);
  }
}
