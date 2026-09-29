import { IsDateString, isNotEmpty, IsNotEmpty, IsPhoneNumber, isString, IsString } from 'class-validator';

export class CreateDriverApplicationDto {
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

    @IsDateString()
    licenseExpiryDate: Date;

    @IsPhoneNumber('CM', {
       message: 'Enter a valid Cameroon phone number, e.g. 677123456 or +237677123456',
     })
     phoneNumber: string;
}