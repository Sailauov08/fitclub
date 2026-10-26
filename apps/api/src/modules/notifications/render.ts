import {
  CLUB_TIMEZONE,
  formatKzt,
  pickLocale,
  renderTemplate,
  type EmailOnlyType,
  type Locale,
  type LocalizedText,
  type NotificationType,
} from '@fitclub/shared';

const intlTag = (locale: Locale) => (locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU');

export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    timeZone: CLUB_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDate(value: string, locale: Locale): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat(intlTag(locale), {
    timeZone: CLUB_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function isLocalized(v: unknown): v is LocalizedText {
  return typeof v === 'object' && v !== null && 'ru' in v && 'en' in v;
}

/**
 * Notification data is stored language-neutral (ISO dates, numbers, {kk,ru,en} objects)
 * and rendered at read time, so switching language re-renders past notifications too.
 */
export function renderNotification(
  type: NotificationType | EmailOnlyType,
  locale: Locale,
  data: Record<string, unknown>,
) {
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(data)) {
    if (raw === null || raw === undefined) continue;
    if (isLocalized(raw)) values[key] = pickLocale(raw, locale);
    else if (key === 'when' && typeof raw === 'string') values[key] = formatDateTime(raw, locale);
    else if (key.endsWith('On') && typeof raw === 'string') values[key] = formatDate(raw, locale);
    else if (key === 'amount' && typeof raw === 'number') values[key] = formatKzt(raw, locale);
    else values[key] = String(raw);
  }
  return renderTemplate(type, locale, values);
}
