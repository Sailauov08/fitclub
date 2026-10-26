import { z } from 'zod';
import { isDateKey } from '../domain/dates';

/**
 * Validation messages are translation keys (`v.*`), resolved by the web app in the
 * visitor's language. The API returns them unchanged inside `details`.
 */
export const idSchema = z.string().min(1).max(64);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { message: 'v.tooLong' })
  .pipe(z.email({ message: 'v.email' }));

/** At least 10 characters with a letter and a digit. Length capped to bound hashing cost. */
export const passwordSchema = z
  .string()
  .min(10, { message: 'v.passwordMin' })
  .max(128, { message: 'v.tooLong' })
  .refine((v) => /[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/.test(v) && /\d/.test(v), { message: 'v.passwordWeak' });

export const personNameSchema = z.string().trim().min(1, { message: 'v.required' }).max(80, { message: 'v.tooLong' });

/**
 * Kazakhstan numbers: +7 followed by 10 digits whose area/operator code starts with 6 or 7
 * (Russian +7 numbers start with 3/4/8/9). Accepts "8 701 …", "+7 (701) …", "7701…".
 */
export function normalizeKzPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (!/^7[67]\d{9}$/.test(digits)) return null;
  return `+${digits}`;
}

export function formatKzPhone(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.length !== 11) return e164;
  return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizeKzPhone(v);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'v.phone' });
      return z.NEVER;
    }
    return normalized;
  });

export const optionalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const normalized = normalizeKzPhone(v);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'v.phone' });
      return z.NEVER;
    }
    return normalized;
  });

export const dateKeySchema = z.string().refine(isDateKey, { message: 'v.date' });

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'v.time' });

export const moneySchema = z.coerce
  .number({ message: 'v.number' })
  .int({ message: 'v.integer' })
  .min(0, { message: 'v.min' })
  .max(100_000_000, { message: 'v.max' });

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, { message: 'v.required' })
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'v.slug' });

export const urlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v.startsWith('/') || /^https:\/\//.test(v), { message: 'v.url' });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;

export const dateRangeSchema = z.object({
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
});

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Parses "true"/"false"/"1"/"0" query strings — z.coerce.boolean() would treat "false" as true. */
export const queryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');
