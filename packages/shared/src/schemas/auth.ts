import { z } from 'zod';
import { STAFF_ROLES } from '../enums';
import { localeSchema } from '../i18n';
import {
  emailSchema,
  idSchema,
  optionalPhoneSchema,
  passwordSchema,
  personNameSchema,
  phoneSchema,
  dateKeySchema,
} from './common';

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: phoneSchema,
  locale: localeSchema.default('ru'),
  homeBranchId: idSchema.optional(),
  acceptTerms: z.literal(true, { message: 'v.acceptTerms' }),
  marketingOptIn: z.boolean().default(false),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'v.required' }).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: 'v.required' }).max(128),
  newPassword: passwordSchema,
});

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: phoneSchema,
});

export const NOTIFICATION_CATEGORIES = ['bookings', 'membership', 'payments', 'reminders', 'marketing'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const notificationPrefsSchema = z.object({
  bookings: z.object({ inApp: z.boolean(), email: z.boolean() }),
  membership: z.object({ inApp: z.boolean(), email: z.boolean() }),
  payments: z.object({ inApp: z.boolean(), email: z.boolean() }),
  reminders: z.object({ inApp: z.boolean(), email: z.boolean() }),
  marketing: z.object({ inApp: z.boolean(), email: z.boolean() }),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  bookings: { inApp: true, email: true },
  membership: { inApp: true, email: true },
  payments: { inApp: true, email: true },
  reminders: { inApp: true, email: false },
  marketing: { inApp: false, email: false },
};

export const updateProfileSchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: phoneSchema,
  locale: localeSchema,
  birthDate: dateKeySchema.nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const inviteStaffSchema = z.object({
  email: emailSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  role: z.enum(STAFF_ROLES),
  branchId: idSchema.nullable().default(null),
  title: z.string().trim().max(80).optional(),
});

export const updateStaffSchema = z.object({
  role: z.enum(STAFF_ROLES),
  branchId: idSchema.nullable(),
  title: z.string().trim().max(80).nullable().optional(),
});

export const staffStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(3, { message: 'v.reasonRequired' }).max(500),
});

/** Staff-side member creation (walk-in sign-up at reception). The member sets a password via reset link. */
export const createMemberSchema = z.object({
  email: emailSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: phoneSchema,
  locale: localeSchema.default('ru'),
  homeBranchId: idSchema,
  sendInvite: z.boolean().default(true),
});

export const updateMemberSchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: optionalPhoneSchema,
  homeBranchId: idSchema,
  assignedTrainerId: idSchema.nullable().optional(),
});
