import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePassengerApplicationDto {
  
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  identificationNumber: string;

  /**
   * Type of identification document.
   *
   * Example:
   * "National ID"
   * "Passport"
   */
  @IsString()
  @IsNotEmpty()
  identificationType: string;
}
