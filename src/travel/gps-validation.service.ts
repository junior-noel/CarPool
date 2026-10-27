import { Injectable } from '@nestjs/common';

export interface GpsReading {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface GpsValidationResult {
  valid: boolean;
  reason?: string;
  quality?: 'excellent' | 'good' | 'weak';
  weight?: number;
}

@Injectable()
export class GpsValidationService {
  // Initial thresholds in metres. These can become configuration values later.
  private readonly MAX_ACCURACY_METRES = 50;

  validate(reading: GpsReading): GpsValidationResult {
    const { latitude, longitude, accuracy } = reading;

    // Reject non-finite values even if a request bypasses DTO validation.
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(accuracy)
    ) {
      return { valid: false, reason: 'GPS values must be finite numbers' };
    }

    // Coordinates must fall within valid geographic ranges.
    if (latitude < -90 || latitude > 90) {
      return { valid: false, reason: 'Latitude must be between -90 and 90' };
    }

    if (longitude < -180 || longitude > 180) {
      return { valid: false, reason: 'Longitude must be between -180 and 180' };
    }

    // Accuracy is a non-negative radius in metres reported by the device.
    if (accuracy <= 0) {
      return { valid: false, reason: 'Accuracy must be greater than zero' };
    }

    // Poor readings are not eligible to influence the vehicle position.
    if (accuracy > this.MAX_ACCURACY_METRES) {
      return {
        valid: false,
        reason: 'GPS accuracy is too poor for position calculation',
      };
    }

    // Classify valid readings so later stages can apply different weights.
    const quality =
      accuracy <= 10 ? 'excellent' : accuracy <= 20 ? 'good' : 'weak';

    // Accuracy-weighted calculation: more accurate readings receive more weight.
    // The small floor prevents division by zero or extreme weights.
    const weight = 1 / Math.max(accuracy ** 2, 1);

    return {
      valid: true,
      quality,
      weight,
    };
  }
}
