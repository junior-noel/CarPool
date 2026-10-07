import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
    Min,
  MaxLength
} from 'class-validator';

export class CreateReviewDto {
  // The completed Travel being reviewed.
  @IsUUID()
  travelId: string;

  // The participant being reviewed.
  @IsUUID()
  reviewedUserId: string;

  // Review rating must be a whole number between 1 and 5.
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  // Written comment is optional.
  @IsOptional()
  @MaxLength(1000)
  comment?: string;

  // Anonymous review is optional and defaults to false when it is not provided.
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}
