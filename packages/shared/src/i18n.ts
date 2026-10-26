import { z } from 'zod';

export const LOCALES = ['kk', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';

export const CLUB_TIMEZONE = 'Asia/Almaty';
export const CURRENCY = 'KZT';

export const localeSchema = z.enum(LOCALES);

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Text stored once per supported language. */
export type LocalizedText = Record<Locale, string>;

/** All three languages are required for published content. */
export const localizedTextSchema = z.object({
  kk: z.string().trim().max(20000),
  ru: z.string().trim().max(20000),
  en: z.string().trim().max(20000),
});

export const requiredLocalizedTextSchema = z.object({
  kk: z.string().trim().min(1, { message: 'v.required' }).max(20000),
  ru: z.string().trim().min(1, { message: 'v.required' }).max(20000),
  en: z.string().trim().min(1, { message: 'v.required' }).max(20000),
});

/**
 * Picks the best available translation. Falls back to Russian, then English, then Kazakh,
 * so a partially translated draft never renders an empty string.
 */
export function pickLocale(text: Partial<LocalizedText> | null | undefined, locale: Locale): string {
  if (!text) return '';
  return text[locale] || text.ru || text.en || text.kk || '';
}

export function lt(kk: string, ru: string, en: string): LocalizedText {
  return { kk, ru, en };
}
