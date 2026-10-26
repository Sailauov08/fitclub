import { CLUB_TIMEZONE, addDaysToKey, localDateKey, zonedDateTime } from '@fitclub/shared';

/** Postgres DATE columns are read/written as UTC midnight. */
export function keyToDbDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

export function dbDateToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayKey(now = new Date()): string {
  return localDateKey(now, CLUB_TIMEZONE);
}

/** [start, end) instants for local calendar keys `from`..`to` inclusive. */
export function localRange(from: string, to: string) {
  return { gte: zonedDateTime(from), lt: zonedDateTime(addDaysToKey(to, 1)) };
}

export function defaultRange(days = 30, now = new Date()) {
  const to = todayKey(now);
  return { from: addDaysToKey(to, -(days - 1)), to };
}
