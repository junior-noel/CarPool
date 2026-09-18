import { IsEmail, MinLength, IsString } from 'class-validator';

export class loginDto {
  @IsEmail()
  email: string;

  // The email must have a valid email format.
  @IsString()
  @MinLength(6)
  password: string;
}