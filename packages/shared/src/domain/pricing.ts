import type { PromotionStatus, PromotionType } from '../enums';

export interface PromotionLike {
  type: PromotionType;
  /** Percent (1–100) for PERCENT, whole tenge for FIXED. */
  value: number;
  status: PromotionStatus;
  validFrom: Date | null;
  validUntil: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  perMemberLimit: number | null;
  newMembersOnly: boolean;
  /** Empty = applies to all plans. */
  planIds: readonly string[];
  minAmount: number | null;
}

export type PromotionRejection =
  | 'NOT_ACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'EXHAUSTED'
  | 'MEMBER_LIMIT'
  | 'NEW_MEMBERS_ONLY'
  | 'PLAN_NOT_ELIGIBLE'
  | 'MIN_AMOUNT';

export function checkPromotionEligibility(
  promo: PromotionLike,
  ctx: { now: Date; planId: string; amount: number; memberRedemptions: number; memberHasPriorMembership: boolean },
): { ok: true } | { ok: false; reason: PromotionRejection } {
  if (promo.status !== 'ACTIVE') return { ok: false, reason: 'NOT_ACTIVE' };
  if (promo.validFrom && ctx.now < promo.validFrom) return { ok: false, reason: 'NOT_STARTED' };
  if (promo.validUntil && ctx.now >= promo.validUntil) return { ok: false, reason: 'EXPIRED' };
  if (promo.maxRedemptions !== null && promo.redemptionCount >= promo.maxRedemptions) {
    return { ok: false, reason: 'EXHAUSTED' };
  }
  if (promo.perMemberLimit !== null && ctx.memberRedemptions >= promo.perMemberLimit) {
    return { ok: false, reason: 'MEMBER_LIMIT' };
  }
  if (promo.newMembersOnly && ctx.memberHasPriorMembership) return { ok: false, reason: 'NEW_MEMBERS_ONLY' };
  if (promo.planIds.length > 0 && !promo.planIds.includes(ctx.planId))
    return { ok: false, reason: 'PLAN_NOT_ELIGIBLE' };
  if (promo.minAmount !== null && ctx.amount < promo.minAmount) return { ok: false, reason: 'MIN_AMOUNT' };
  return { ok: true };
}

/**
 * Discount in whole tenge. Percent discounts round down to a whole tenge; a discount never
 * exceeds the price, so the total is never negative.
 */
export function calculateDiscount(price: number, promo: Pick<PromotionLike, 'type' | 'value'>): number {
  if (!Number.isInteger(price) || price < 0) throw new Error('price must be a non-negative integer');
  const raw =
    promo.type === 'PERCENT' ? Math.floor((price * Math.min(100, Math.max(0, promo.value))) / 100) : promo.value;
  return Math.min(price, Math.max(0, Math.floor(raw)));
}

export function applyPromotion(price: number, promo: Pick<PromotionLike, 'type' | 'value'> | null) {
  const discount = promo ? calculateDiscount(price, promo) : 0;
  return { subtotal: price, discount, total: price - discount };
}

/** Formats an integer tenge amount, e.g. 25000 → "25 000 ₸". */
export function formatKzt(amount: number, locale: string = 'ru'): string {
  // Kazakh uses the same grouping as Russian ("32 000 ₸"); browsers often lack kk number data.
  const tag = locale === 'en' ? 'en-US' : 'ru-RU';
  return new Intl.NumberFormat(tag, {
    style: 'currency',
    currency: 'KZT',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(amount);
}
