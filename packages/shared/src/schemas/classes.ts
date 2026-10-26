import { z } from 'zod';
import { DIFFICULTIES } from '../enums';
import { localizedTextSchema, requiredLocalizedTextSchema } from '../i18n';
import { dateKeySchema, idSchema, paginationSchema, slugSchema, timeSchema, urlSchema } from './common';

export const classCategoryInputSchema = z.object({
  slug: slugSchema,
  name: requiredLocalizedTextSchema,
  sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
});

export const classTypeInputSchema = z.object({
  slug: slugSchema,
  categoryId: idSchema,
  name: requiredLocalizedTextSchema,
  summary: localizedTextSchema,
  description: localizedTextSchema,
  difficulty: z.enum(DIFFICULTIES),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  defaultCapacity: z.coerce.number().int().min(1).max(200),
  intensity: z.coerce.number().int().min(1).max(5),
  imageUrl: urlSchema.nullable(),
  isPublic: z.boolean().default(true),
});
export type ClassTypeInput = z.infer<typeof classTypeInputSchema>;

export const scheduleInputSchema = z
  .object({
    classTypeId: idSchema,
    trainerId: idSchema,
    roomId: idSchema,
    /** 0 = Monday … 6 = Sunday */
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: timeSchema,
    durationMinutes: z.coerce.number().int().min(15).max(240),
    capacity: z.coerce.number().int().min(1).max(200),
    validFrom: dateKeySchema,
    validUntil: dateKeySchema.nullable(),
  })
  .refine((s) => !s.validUntil || s.validFrom <= s.validUntil, { message: 'v.dateOrder', path: ['validUntil'] });
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export const sessionInputSchema = z.object({
  classTypeId: idSchema,
  trainerId: idSchema,
  roomId: idSchema,
  date: dateKeySchema,
  startTime: timeSchema,
  durationMinutes: z.coerce.number().int().min(15).max(240),
  capacity: z.coerce.number().int().min(1).max(200),
});

export const sessionUpdateSchema = z.object({
  trainerId: idSchema.optional(),
  roomId: idSchema.optional(),
  capacity: z.coerce.number().int().min(1).max(200).optional(),
});

export const cancelSessionSchema = z.object({
  reason: z.string().trim().min(3, { message: 'v.reasonRequired' }).max(500),
});

export const sessionQuerySchema = z.object({
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  branchId: idSchema.optional(),
  categoryId: idSchema.optional(),
  classTypeId: idSchema.optional(),
  trainerId: idSchema.optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
});

export const bookSessionSchema = z.object({ sessionId: idSchema });
export const staffBookSchema = z.object({ sessionId: idSchema, memberId: idSchema });

export const attendanceSchema = z.object({
  status: z.enum(['ATTENDED', 'NO_SHOW']),
});

export const checkInSchema = z.union([
  z.object({ qrToken: z.string().trim().min(10).max(400), branchId: idSchema }),
  z.object({ memberId: idSchema, branchId: idSchema }),
]);

export const checkInOverrideSchema = z.object({
  memberId: idSchema,
  branchId: idSchema,
  reason: z.string().trim().min(5, { message: 'v.reasonRequired' }).max(500),
});

export const checkInListQuerySchema = paginationSchema.extend({
  branchId: idSchema.optional(),
  date: dateKeySchema.optional(),
  status: z.enum(['ACCEPTED', 'REJECTED']).optional(),
  memberId: idSchema.optional(),
});

export const roomInputSchema = z.object({
  branchId: idSchema,
  name: requiredLocalizedTextSchema,
  capacity: z.coerce.number().int().min(1).max(500),
  equipment: localizedTextSchema,
  isActive: z.boolean().default(true),
});

const openingHoursDay = z
  .object({ open: timeSchema, close: timeSchema, closed: z.boolean().default(false) })
  .refine((d) => d.closed || d.open < d.close, { message: 'v.timeOrder', path: ['close'] });

export const openingHoursSchema = z.array(openingHoursDay).length(7);
export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const branchInputSchema = z.object({
  slug: slugSchema,
  name: requiredLocalizedTextSchema,
  city: requiredLocalizedTextSchema,
  address: requiredLocalizedTextSchema,
  description: localizedTextSchema,
  phone: z.string().trim().max(32),
  email: z.string().trim().max(254),
  latitude: z.coerce.number().min(-90).max(90).nullable(),
  longitude: z.coerce.number().min(-180).max(180).nullable(),
  openingHours: openingHoursSchema,
  imageUrl: urlSchema.nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
});
export type BranchInput = z.infer<typeof branchInputSchema>;

export const trainerInputSchema = z.object({
  slug: slugSchema,
  userId: idSchema.nullable().optional(),
  displayName: z.string().trim().min(2).max(80),
  headline: requiredLocalizedTextSchema,
  bio: localizedTextSchema,
  specializations: z.array(z.string().trim().min(1).max(40)).max(10),
  certifications: z.array(z.string().trim().min(1).max(120)).max(10),
  experienceYears: z.coerce.number().int().min(0).max(60),
  photoUrl: urlSchema.nullable(),
  branchId: idSchema,
  offersPersonalTraining: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
});
export type TrainerInput = z.infer<typeof trainerInputSchema>;

export const availabilitySchema = z.object({
  slots: z
    .array(
      z
        .object({
          weekday: z.coerce.number().int().min(0).max(6),
          startTime: timeSchema,
          endTime: timeSchema,
          branchId: idSchema,
        })
        .refine((s) => s.startTime < s.endTime, { message: 'v.timeOrder', path: ['endTime'] }),
    )
    .max(50),
});
