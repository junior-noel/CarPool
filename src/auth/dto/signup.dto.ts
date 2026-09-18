
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class signupDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  // The email must follow a valid email format.
  @IsEmail()
  email: string;

  @IsNotEmpty()
  phoneNumber: string | number;

  @IsString()
  @MinLength(6)
  password: string;
}