import { z } from 'zod';
import { LEAD_ACTIVITY_TYPES, LEAD_SOURCES, LEAD_STATUSES } from '../enums';
import {
  dateKeySchema,
  emailSchema,
  idSchema,
  optionalPhoneSchema,
  paginationSchema,
  personNameSchema,
  phoneSchema,
} from './common';

/** Public website enquiry / trial request. `website` is a honeypot that must stay empty. */
export const publicLeadSchema = z
  .object({
    name: personNameSchema,
    email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
    phone: optionalPhoneSchema,
    message: z.string().trim().max(2000).optional(),
    branchId: idSchema.optional(),
    interest: z.string().trim().max(120).optional(),
    source: z.enum(['WEBSITE_CONTACT', 'TRIAL_REQUEST']),
    preferredDate: dateKeySchema.optional(),
    consent: z.literal(true, { message: 'v.consent' }),
    website: z.string().max(0).optional(),
  })
  .refine((l) => Boolean(l.email || l.phone), { message: 'v.contactRequired', path: ['phone'] });
export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

export const leadInputSchema = z
  .object({
    name: personNameSchema,
    email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
    phone: optionalPhoneSchema,
    source: z.enum(LEAD_SOURCES),
    branchId: idSchema.nullable().optional(),
    interest: z.string().trim().max(120).optional(),
    message: z.string().trim().max(2000).optional(),
    assignedToId: idSchema.nullable().optional(),
  })
  .refine((l) => Boolean(l.email || l.phone), { message: 'v.contactRequired', path: ['phone'] });

export const leadStatusSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
    lostReason: z.string().trim().max(500).optional(),
  })
  .refine((s) => s.status !== 'LOST' || Boolean(s.lostReason), { message: 'v.reasonRequired', path: ['lostReason'] });

export const leadAssignSchema = z.object({ assignedToId: idSchema.nullable() });

export const leadActivitySchema = z.object({
  type: z.enum(LEAD_ACTIVITY_TYPES).exclude(['STATUS_CHANGE', 'ASSIGNMENT']),
  body: z.string().trim().min(1, { message: 'v.required' }).max(2000),
  dueAt: z.iso.datetime({ offset: true }).optional(),
});

export const leadListQuerySchema = paginationSchema.extend({
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  assignedToId: z.string().optional(),
  branchId: idSchema.optional(),
});

/** Turns a lead into a member account (and optionally sells a membership in the same step). */
export const convertLeadSchema = z.object({
  email: emailSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: phoneSchema,
  homeBranchId: idSchema,
});
