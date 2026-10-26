'use client';

import { useLocale } from 'next-intl';
import { pickLocale, type Locale, type LocalizedText } from '@fitclub/shared';
import { formatClubDate, formatClubNumber, formatClubRelative, KZT } from './intl';

/** Formatting helpers bound to the active locale and the club timezone (Asia/Almaty). */
export function useFmt() {
  const locale = useLocale() as Locale;
  return {
    locale,
    money: (n: number) => formatClubNumber(n, locale, KZT),
    number: (n: number) => formatClubNumber(n, locale),
    percent: (n: number | null | undefined) =>
      n === null || n === undefined ? '—' : formatClubNumber(n, locale, { style: 'percent', maximumFractionDigits: 0 }),
    date: (v: string | Date) => formatClubDate(v, locale, 'short'),
    dateLong: (v: string | Date) => formatClubDate(v, locale, 'long'),
    time: (v: string | Date) => formatClubDate(v, locale, 'time'),
    dateTime: (v: string | Date) => formatClubDate(v, locale, 'weekdayTime'),
    weekday: (v: string | Date) => formatClubDate(v, locale, 'weekday'),
    relative: (v: string | Date) => formatClubRelative(v, locale),
    /** Inclusive last day of a membership whose `endsAt` is the following midnight. */
    lastDay: (endsAt: string | Date) => formatClubDate(new Date(new Date(endsAt).getTime() - 1), locale, 'short'),
    t: (text: Partial<LocalizedText> | null | undefined) => pickLocale(text, locale),
  };
}
