import type { ConfigService } from '@nestjs/config';

/**
 * Dependency-free helpers for interpreting ride wall-clock times in the
 * configured APP_TIMEZONE. These never rely on the server's local timezone:
 * every conversion takes an explicit IANA timezone.
 */

// Resolve the IANA timezone used for all ride date/time math, defaulting to
// Africa/Douala when APP_TIMEZONE is missing, blank, or not a string.
export function resolveAppTimezone(config: ConfigService): string {
  const raw = config.get<string>('APP_TIMEZONE');
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value.length > 0 ? value : 'Africa/Douala';
}

// Read an integer "minutes" window from config, falling back when the value is
// absent or not a finite integer. This keeps a malformed .env from breaking starts.
export function readWindowMinutes(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string>(key);
  const parsed = raw == null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Convert a ride's wall-clock departure (date "yyyy-mm-dd" + time "hh:mm:ss")
 * into a UTC epoch (ms) that the caller interprets in the given IANA timezone.
 *
 * It deliberately ignores the server's local timezone. The approach treats the
 * wall-clock fields as if they were UTC ("guess"), reads back how that instant
 * is rendered in the target zone, and corrects by the resulting offset.
 */
export function departureTimestampMs(
  departureDate: Date | string,
  departureTime: string,
  timeZone: string,
): number {
  const dateStr =
    typeof departureDate === 'string'
      ? departureDate.slice(0, 10)
      : departureDate.toISOString().slice(0, 10);
  const wallClock = `${dateStr}T${departureTime}`;

  // Step 1: interpret the wall-clock fields as if they were UTC.
  const asUtcMs = Date.parse(`${wallClock}Z`);

  // Step 2: render that instant in the target zone to recover the true offset.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(asUtcMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const renderedAsUtcMs = Date.parse(
    `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value(
      'minute',
    )}:${value('second')}Z`,
  );

  // Step 3: the offset of the zone at this instant, then remove it from the
  // "guess" to obtain the true UTC instant whose wall-clock equals the input.
  const offsetMs = renderedAsUtcMs - asUtcMs;
  return asUtcMs - offsetMs;
}

// Report whether `nowMs` falls within the start window: from `beforeMin`
// minutes before departure to `afterMin` minutes after it (both inclusive).
export function isWithinDepartureWindow(
  nowMs: number,
  departureMs: number,
  beforeMin: number,
  afterMin: number,
): boolean {
  return (
    nowMs >= departureMs - beforeMin * 60_000 &&
    nowMs <= departureMs + afterMin * 60_000
  );
}