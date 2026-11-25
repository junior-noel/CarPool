import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateReviewDto {
  // Rating is optional because the reviewer may only want
  // to change the comment or anonymity setting.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  // Comment is optional for the same reason.
  @IsOptional()
  comment?: string;

  // Allows the reviewer to change whether the review
  // is anonymous or not.
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}
