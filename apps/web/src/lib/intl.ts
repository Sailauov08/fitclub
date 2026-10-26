import type { Locale } from '@fitclub/shared';

/**
 * Locale formatting that renders identically on the server (Node, full ICU) and in every browser.
 *
 * Many browsers ship incomplete Kazakh ICU data (dates fall back to "2026 M10 26", numbers to
 * "₸ 32,000"), which also breaks hydration. Kazakh dates are therefore built from explicit names,
 * and Kazakh numbers use Russian rules, which match Kazakhstan's conventions (32 000 ₸, 1 234,5).
 */
export const CLUB_TZ = 'Asia/Almaty';

export type DateStyle = 'short' | 'long' | 'time' | 'weekdayTime' | 'weekday' | 'dayMonth';

const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', ru: 'ru-RU', kk: 'ru-RU' };

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit' },
  weekdayTime: { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  weekday: { weekday: 'long' },
  dayMonth: { day: 'numeric', month: 'long' },
};

const KK_MONTHS = [
  'қаңтар',
  'ақпан',
  'наурыз',
  'сәуір',
  'мамыр',
  'маусым',
  'шілде',
  'тамыз',
  'қыркүйек',
  'қазан',
  'қараша',
  'желтоқсан',
];
const KK_MONTHS_SHORT = [
  'қаң.',
  'ақп.',
  'нау.',
  'сәу.',
  'мам.',
  'мау.',
  'шіл.',
  'там.',
  'қыр.',
  'қаз.',
  'қар.',
  'жел.',
];
// Indexed like Date#getDay (0 = Sunday).
const KK_WEEKDAYS = ['жексенбі', 'дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі'];
const KK_WEEKDAYS_SHORT = ['жс', 'дс', 'сс', 'ср', 'бс', 'жм', 'сн'];

const fieldFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CLUB_TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendar fields of an instant in the club timezone. */
function clubFields(d: Date) {
  const p = Object.fromEntries(fieldFormat.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: p.year,
    month: Number(p.month),
    day: Number(p.day),
    weekday: WEEKDAY_INDEX[p.weekday ?? ''] ?? 0,
    time: `${p.hour}:${p.minute}`,
  };
}

export function formatClubDate(value: string | Date, locale: Locale, style: DateStyle): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (locale !== 'kk')
    return new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...OPTIONS[style], timeZone: CLUB_TZ }).format(d);
  const f = clubFields(d);
  switch (style) {
    case 'short':
      return `${f.day} ${KK_MONTHS_SHORT[f.month - 1]} ${f.year}`;
    case 'long':
      return `${f.year} ж. ${f.day} ${KK_MONTHS[f.month - 1]}`;
    case 'time':
      return f.time;
    case 'weekdayTime':
      return `${KK_WEEKDAYS_SHORT[f.weekday]}, ${f.day} ${KK_MONTHS_SHORT[f.month - 1]}, ${f.time}`;
    case 'weekday':
      return KK_WEEKDAYS[f.weekday] ?? '';
    case 'dayMonth':
      return `${f.day} ${KK_MONTHS[f.month - 1]}`;
  }
}

export function formatClubNumber(n: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(n);
}

export const KZT: Intl.NumberFormatOptions = {
  style: 'currency',
  currency: 'KZT',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
};

// [unit, size, "N … бұрын" word, "N … кейін" ablative form]
const KK_UNITS: [Intl.RelativeTimeFormatUnit, number, string, string][] = [
  ['year', 365 * 86_400_000, 'жыл', 'жылдан'],
  ['month', 30 * 86_400_000, 'ай', 'айдан'],
  ['week', 7 * 86_400_000, 'апта', 'аптадан'],
  ['day', 86_400_000, 'күн', 'күннен'],
  ['hour', 3_600_000, 'сағат', 'сағаттан'],
  ['minute', 60_000, 'минут', 'минуттан'],
];

/** "3 күн бұрын" / "2 сағаттан кейін"; other locales use Intl.RelativeTimeFormat. */
export function formatClubRelative(value: string | Date, locale: Locale, now = Date.now()): string {
  const diff = (typeof value === 'string' ? new Date(value) : value).getTime() - now;
  const abs = Math.abs(diff);
  const [unit, ms, past, future] = KK_UNITS.find(([, size]) => abs >= size) ?? ['second', 1000, '', ''];
  const amount = Math.round(diff / ms);
  if (locale !== 'kk')
    return new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' }).format(amount, unit);
  if (unit === 'second') return 'жаңа ғана';
  return amount < 0 ? `${-amount} ${past} бұрын` : `${amount} ${future} кейін`;
}
