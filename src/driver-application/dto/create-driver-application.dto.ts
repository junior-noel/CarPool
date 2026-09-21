import { IsDateString, isNotEmpty, IsNotEmpty, isString, IsString } from 'class-validator';

export class CreateDriverApplicationDto {
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

    @IsDateString()
    licenseExpiryDate: Date;

    @IsString()
    @IsNotEmpty()
    phoneNumber: string
}