import { IsLatitude, IsLongitude, IsNumber, Max, Min } from 'class-validator';

export class UpdateLocationDto {
  // GPS latitude.
  // Valid range: -90 to 90.
  @IsLatitude()
  latitude: number;

  // GPS longitude.
  // Valid range: -180 to 180.
  @IsLongitude()
  longitude: number;

  // Accuracy reported by the device in meters.
  // We accept 0-500m here because the service will later decide whether the reading is accurate enough to use.
  @IsNumber()
  @Min(0)
  @Max(500)
  accuracy: number;
}
