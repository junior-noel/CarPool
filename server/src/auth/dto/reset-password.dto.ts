import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'mbishitech5@gmail.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Six-digit password-reset code.',
    example: '001234',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  otp: string;

  @ApiProperty({
    description:
      'At least 8 characters with lowercase, uppercase, number, and symbol; maximum 128 characters.',
    example: 'NewPassword123!',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol',
    },
  )
  newPassword: string;
}
