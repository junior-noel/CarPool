import { IsInt, IsNotEmpty, IsString, MIN, Max, Min } from 'class-validator';

export class CreateVehicleDto {
    @IsString()
    @IsNotEmpty()
    make: string;

    @IsString()
    @IsNotEmpty()
    model: string;

    @IsString()
    @IsNotEmpty()
    color: string

    @IsInt()
    @IsNotEmpty()
    @Min(1900)
    @Max(2100)
    year: number;

    @IsString()
    @IsNotEmpty()
    licensePlate: string;

    @IsInt()
    @Min(1)
    @Max(50)
    seats: number;
}