import { CLUB_TIMEZONE } from '../i18n';

const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (Asia/Almaty → +300). */
export function tzOffsetMinutes(date: Date, timeZone: string = CLUB_TIMEZONE): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / MS_PER_MINUTE);
}

/** Calendar date in the club's timezone as `YYYY-MM-DD`. */
export function localDateKey(date: Date, timeZone: string = CLUB_TIMEZONE): string {
  const p = parts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC instant of `minutes` after local midnight of `key` in `timeZone`. */
export function zonedDateTime(key: string, minutes = 0, timeZone: string = CLUB_TIMEZONE): Date {
  const naive = new Date(`${key}T00:00:00Z`).getTime() + minutes * MS_PER_MINUTE;
  // Two passes handle offset changes (DST) correctly; Asia/Almaty has none today but other branches might.
  let guess = naive - tzOffsetMinutes(new Date(naive), timeZone) * MS_PER_MINUTE;
  guess = naive - tzOffsetMinutes(new Date(guess), timeZone) * MS_PER_MINUTE;
  return new Date(guess);
}

export function startOfLocalDay(date: Date, timeZone: string = CLUB_TIMEZONE): Date {
  return zonedDateTime(localDateKey(date, timeZone), 0, timeZone);
}

/** 0 = Monday … 6 = Sunday, in the club's timezone. */
export function localWeekday(date: Date, timeZone: string = CLUB_TIMEZONE): number {
  const key = localDateKey(date, timeZone);
  const utcDay = new Date(`${key}T00:00:00Z`).getUTCDay();
  return (utcDay + 6) % 7;
}

export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hhmmToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid time ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}
