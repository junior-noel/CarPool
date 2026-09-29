
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  MaxLength,
  IsPhoneNumber,
} from 'class-validator';



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

  @IsPhoneNumber('CM', {
    message: 'Enter a valid Cameroon phone number, e.g. 677123456 or +237677123456',
  })
  phoneNumber: string;

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
  password: string;
}