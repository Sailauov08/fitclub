import { z } from 'zod';
import {
  MEMBERSHIP_STATUSES,
  PAYMENT_METHODS,
  PLAN_TYPES,
  PROMOTION_STATUSES,
  PROMOTION_TYPES,
  RECONCILIATION_STATUSES,
} from '../enums';
import { localizedTextSchema, requiredLocalizedTextSchema } from '../i18n';
import { dateKeySchema, idSchema, moneySchema, paginationSchema, queryBoolean } from './common';

export const planInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,32}$/, { message: 'v.code' }),
    type: z.enum(PLAN_TYPES),
    name: requiredLocalizedTextSchema,
    description: localizedTextSchema,
    features: z.array(requiredLocalizedTextSchema).max(12).default([]),
    price: moneySchema,
    durationDays: z.coerce.number().int().min(1).max(730),
    visitLimit: z.coerce.number().int().min(1).max(1000).nullable(),
    includesClasses: z.boolean(),
    allBranches: z.boolean(),
    branchIds: z.array(idSchema).default([]),
    freezeMaxDays: z.coerce.number().int().min(0).max(180),
    freezeMaxTimes: z.coerce.number().int().min(0).max(12),
    requiresStudentId: z.boolean().default(false),
    isPublic: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
  })
  .refine((p) => p.allBranches || p.branchIds.length > 0, { message: 'v.branchRequired', path: ['branchIds'] });
export type PlanInput = z.infer<typeof planInputSchema>;

export const purchaseMembershipSchema = z.object({
  planId: idSchema,
  promoCode: z.string().trim().toUpperCase().max(40).optional(),
  startDate: dateKeySchema.optional(),
});

export const renewMembershipSchema = z.object({
  promoCode: z.string().trim().toUpperCase().max(40).optional(),
});

/** Sale at the front desk / by a sales manager. Offline methods record a real payment immediately. */
export const staffSellMembershipSchema = z.object({
  memberId: idSchema,
  planId: idSchema,
  promoCode: z.string().trim().toUpperCase().max(40).optional(),
  startDate: dateKeySchema.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentReference: z.string().trim().max(120).optional(),
  leadId: idSchema.optional(),
});

export const freezeMembershipSchema = z.object({
  startDate: dateKeySchema,
  days: z.coerce.number().int().min(1).max(180),
  reason: z.string().trim().max(500).optional(),
});

export const extendMembershipSchema = z.object({
  days: z.coerce.number().int().min(1).max(365),
  reason: z.string().trim().min(3, { message: 'v.reasonRequired' }).max(500),
});

export const cancelMembershipSchema = z.object({
  reason: z.string().trim().min(3, { message: 'v.reasonRequired' }).max(500),
});

export const membershipListQuerySchema = paginationSchema.extend({
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
  planId: idSchema.optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(90).optional(),
});

export const promotionInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,40}$/, { message: 'v.code' })
      .nullable(),
    name: requiredLocalizedTextSchema,
    description: localizedTextSchema,
    type: z.enum(PROMOTION_TYPES),
    value: z.coerce.number().int().min(1),
    status: z.enum(PROMOTION_STATUSES).default('ACTIVE'),
    validFrom: dateKeySchema.nullable(),
    validUntil: dateKeySchema.nullable(),
    maxRedemptions: z.coerce.number().int().min(1).nullable(),
    perMemberLimit: z.coerce.number().int().min(1).nullable(),
    newMembersOnly: z.boolean().default(false),
    planIds: z.array(idSchema).default([]),
    minAmount: moneySchema.nullable().default(null),
    isPublic: z.boolean().default(false),
    imageUrl: z.string().trim().max(2048).nullable().default(null),
  })
  .refine((p) => p.type !== 'PERCENT' || p.value <= 100, { message: 'v.percentMax', path: ['value'] })
  .refine((p) => !p.validFrom || !p.validUntil || p.validFrom <= p.validUntil, {
    message: 'v.dateOrder',
    path: ['validUntil'],
  });
export type PromotionInput = z.infer<typeof promotionInputSchema>;

export const validatePromoSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(40),
  planId: idSchema,
});

export const refundSchema = z.object({
  amount: z.coerce.number().int().min(1),
  reason: z.string().trim().min(3, { message: 'v.reasonRequired' }).max(500),
});

export const reconcileSchema = z.object({
  status: z.enum(RECONCILIATION_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export const paymentListQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  reconciliation: z.enum(RECONCILIATION_STATUSES).optional(),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  includeTest: queryBoolean.optional(),
});
