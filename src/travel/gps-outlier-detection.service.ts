import { Injectable } from '@nestjs/common';

export interface GpsCoordinate {
  latitude: number;
  longitude: number;
  recordedAt: Date;
}

export interface GpsOutlierResult {
  valid: boolean;
  reason?: string;
  distanceMetres?: number;
  elapsedSeconds?: number;
  speedKmh?: number;
}

@Injectable()
export class GpsOutlierDetectionService {
  // Maximum plausible speed for a vehicle, in kilometres per hour.
  private readonly MAX_SPEED_KMH = 150;

  // Reject readings received less than one second after the previous reading.
  private readonly MIN_ELAPSED_SECONDS = 1;

  /**
   * Calculate the distance between two GPS coordinates using
   * the Haversine formula.
   */
  private calculateDistance(
    previous: GpsCoordinate,
    current: GpsCoordinate,
  ): number {
    const earthRadiusMetres = 6371000;

    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

    const latitudeDifference = toRadians(current.latitude - previous.latitude);

    const longitudeDifference = toRadians(
      current.longitude - previous.longitude,
    );

    const previousLatitude = toRadians(previous.latitude);
    const currentLatitude = toRadians(current.latitude);

    const a =
      Math.sin(latitudeDifference / 2) ** 2 +
      Math.cos(previousLatitude) *
        Math.cos(currentLatitude) *
        Math.sin(longitudeDifference / 2) ** 2;

    // Protect against floating-point rounding outside the valid range.
    const boundedA = Math.min(1, Math.max(0, a));

    const angularDistance =
      2 * Math.atan2(Math.sqrt(boundedA), Math.sqrt(1 - boundedA));

    return earthRadiusMetres * angularDistance;
  }

  /**
   * Determine whether a new GPS reading represents physically
   * plausible movement from the participant's previous reading.
   */
  validateMovement(
    previous: GpsCoordinate | null,
    current: GpsCoordinate,
  ): GpsOutlierResult {
    // The first reading establishes the participant's baseline location.
    if (!previous) {
      return { valid: true };
    }

    const previousTime = new Date(previous.recordedAt).getTime();
    const currentTime = new Date(current.recordedAt).getTime();

    // Reject invalid timestamps rather than calculating unreliable speeds.
    if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) {
      return {
        valid: false,
        reason: 'Invalid GPS reading timestamp',
      };
    }

    const elapsedSeconds = (currentTime - previousTime) / 1000;

    // New readings must arrive at least one second after the previous one.
    if (elapsedSeconds < this.MIN_ELAPSED_SECONDS) {
      return {
        valid: false,
        reason: 'GPS reading arrived too soon after the previous reading',
        elapsedSeconds,
      };
    }

    // Calculate the distance travelled between the two readings.
    const distanceMetres = this.calculateDistance(previous, current);

    // Convert distance and elapsed time into kilometres per hour.
    const speedKmh = (distanceMetres / elapsedSeconds) * 3.6;

    // Reject movement that exceeds the configured maximum vehicle speed.
    if (speedKmh > this.MAX_SPEED_KMH) {
      return {
        valid: false,
        reason: 'GPS reading indicates an unrealistic movement speed',
        distanceMetres,
        elapsedSeconds,
        speedKmh,
      };
    }

    return {
      valid: true,
      distanceMetres,
      elapsedSeconds,
      speedKmh,
    };
  }
}
