/**
 * drip-window.ts — random time-in-window util with timezone awareness.
 * Returns next UTC Date for a send slot within [windowStart, windowEnd] hours in the given timezone.
 */
import crypto from 'node:crypto';

const TZ_OFFSET_MINUTES: Record<string, number> = {
  'Asia/Ho_Chi_Minh': 420, // UTC+7
  UTC: 0,
};

function getTzOffsetMinutes(tz: string): number {
  return TZ_OFFSET_MINUTES[tz] ?? TZ_OFFSET_MINUTES['Asia/Ho_Chi_Minh'];
}

/**
 * Compute next UTC Date for a send slot.
 * - baseDate: anchor day (local-tz day boundary). If null, uses tomorrow (local tz).
 * - windowStart/windowEnd: hours 0-23
 * - tz: IANA timezone name
 */
export function nextScheduledAt(
  baseDate: Date | null,
  windowStart: number,
  windowEnd: number,
  tz: string = 'Asia/Ho_Chi_Minh',
): Date {
  if (windowEnd <= windowStart) throw new Error('windowEnd must be > windowStart');
  const offsetMin = getTzOffsetMinutes(tz);

  // Determine local-day anchor
  const anchor = baseDate ? new Date(baseDate.getTime()) : new Date();
  // Convert to local-tz, get YYYY-MM-DD midnight in local tz, then back to UTC
  const localMs = anchor.getTime() + offsetMin * 60_000;
  const localDay = new Date(localMs);
  localDay.setUTCHours(0, 0, 0, 0);
  const localMidnightUtcMs = localDay.getTime() - offsetMin * 60_000;

  const rangeMinutes = (windowEnd - windowStart) * 60;
  const offsetMinutes = crypto.randomInt(0, rangeMinutes);
  const totalMinutes = windowStart * 60 + offsetMinutes;

  return new Date(localMidnightUtcMs + totalMinutes * 60_000);
}

/** For step N>0: next day's window slot */
export function nextDayScheduledAt(
  from: Date,
  windowStart: number,
  windowEnd: number,
  tz: string = 'Asia/Ho_Chi_Minh',
): Date {
  const tomorrow = new Date(from.getTime() + 24 * 3600 * 1000);
  return nextScheduledAt(tomorrow, windowStart, windowEnd, tz);
}
