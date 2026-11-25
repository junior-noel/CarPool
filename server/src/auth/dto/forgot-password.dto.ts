import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address associated with the account.',
    example: 'mbishitech5@gmail.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
