import { describe, expect, it } from 'vitest';
import { checkBookingWindow, checkCancellation, DEFAULT_BOOKING_POLICY, findConflict, rangesOverlap } from './booking';
import { applyPromotion, calculateDiscount, checkPromotionEligibility, type PromotionLike } from './pricing';
import { canTransitionPayment, isPaymentCaptured, nextStatusAfterRefund } from './payment';
import { addDaysToKey, localDateKey, localWeekday, zonedDateTime } from './dates';
import { canChangeStaffRole, hasPermission, ROLE_PERMISSIONS, PERMISSIONS } from '../permissions';
import { normalizeKzPhone, passwordSchema } from '../schemas/common';
import { renderTemplate, NOTIFICATION_TEMPLATES } from '../notifications';
import { LOCALES } from '../i18n';

const policy = DEFAULT_BOOKING_POLICY;
const now = new Date('2026-03-10T10:00:00+05:00');
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

describe('booking window', () => {
  it('accepts sessions inside the window', () => {
    expect(checkBookingWindow({ status: 'SCHEDULED', startsAt: hours(24) }, now, policy)).toEqual({ ok: true });
  });
  it('rejects cancelled sessions', () => {
    expect(checkBookingWindow({ status: 'CANCELLED', startsAt: hours(24) }, now, policy)).toMatchObject({
      reason: 'SESSION_NOT_BOOKABLE',
    });
  });
  it('rejects sessions that started, not yet open, or past cut-off', () => {
    expect(checkBookingWindow({ status: 'SCHEDULED', startsAt: hours(-1) }, now, policy)).toMatchObject({
      reason: 'SESSION_STARTED',
    });
    expect(checkBookingWindow({ status: 'SCHEDULED', startsAt: hours(169) }, now, policy)).toMatchObject({
      reason: 'BOOKING_NOT_OPEN',
    });
    expect(checkBookingWindow({ status: 'SCHEDULED', startsAt: hours(0.25) }, now, policy)).toMatchObject({
      reason: 'BOOKING_CLOSED',
    });
  });
});

describe('cancellation', () => {
  it('is free outside the window and late inside it', () => {
    expect(checkCancellation({ startsAt: hours(24) }, { status: 'CONFIRMED' }, now, policy)).toEqual({
      ok: true,
      late: false,
    });
    expect(checkCancellation({ startsAt: hours(2) }, { status: 'CONFIRMED' }, now, policy)).toEqual({
      ok: true,
      late: true,
    });
  });
  it('cannot cancel after start or a non-confirmed booking', () => {
    expect(checkCancellation({ startsAt: hours(-1) }, { status: 'CONFIRMED' }, now, policy)).toMatchObject({
      ok: false,
    });
    expect(checkCancellation({ startsAt: hours(5) }, { status: 'ATTENDED' }, now, policy)).toMatchObject({
      reason: 'NOT_CANCELLABLE',
    });
  });
});

describe('conflict detection', () => {
  const a = { startsAt: hours(1), endsAt: hours(2) };
  it('detects overlap but not touching ranges', () => {
    expect(rangesOverlap(a, { startsAt: hours(1.5), endsAt: hours(3) })).toBe(true);
    expect(rangesOverlap(a, { startsAt: hours(2), endsAt: hours(3) })).toBe(false);
    expect(findConflict(a, [{ startsAt: hours(5), endsAt: hours(6) }])).toBeUndefined();
  });
});

describe('promotions', () => {
  const promo: PromotionLike = {
    type: 'PERCENT',
    value: 15,
    status: 'ACTIVE',
    validFrom: new Date('2026-03-01'),
    validUntil: new Date('2026-04-01'),
    maxRedemptions: 100,
    redemptionCount: 0,
    perMemberLimit: 1,
    newMembersOnly: false,
    planIds: [],
    minAmount: null,
  };
  const ctx = { now, planId: 'p1', amount: 20000, memberRedemptions: 0, memberHasPriorMembership: false };

  it('calculates discounts with integer rounding and caps', () => {
    expect(calculateDiscount(19990, { type: 'PERCENT', value: 15 })).toBe(2998);
    expect(calculateDiscount(5000, { type: 'FIXED', value: 8000 })).toBe(5000);
    expect(applyPromotion(20000, { type: 'FIXED', value: 3000 })).toEqual({
      subtotal: 20000,
      discount: 3000,
      total: 17000,
    });
    expect(applyPromotion(20000, null).total).toBe(20000);
  });

  it('checks eligibility rules', () => {
    expect(checkPromotionEligibility(promo, ctx)).toEqual({ ok: true });
    expect(checkPromotionEligibility({ ...promo, status: 'PAUSED' }, ctx)).toMatchObject({ reason: 'NOT_ACTIVE' });
    expect(checkPromotionEligibility(promo, { ...ctx, now: new Date('2026-02-01') })).toMatchObject({
      reason: 'NOT_STARTED',
    });
    expect(checkPromotionEligibility(promo, { ...ctx, now: new Date('2026-04-02') })).toMatchObject({
      reason: 'EXPIRED',
    });
    expect(checkPromotionEligibility({ ...promo, redemptionCount: 100 }, ctx)).toMatchObject({ reason: 'EXHAUSTED' });
    expect(checkPromotionEligibility(promo, { ...ctx, memberRedemptions: 1 })).toMatchObject({
      reason: 'MEMBER_LIMIT',
    });
    expect(
      checkPromotionEligibility({ ...promo, newMembersOnly: true }, { ...ctx, memberHasPriorMembership: true }),
    ).toMatchObject({
      reason: 'NEW_MEMBERS_ONLY',
    });
    expect(checkPromotionEligibility({ ...promo, planIds: ['p2'] }, ctx)).toMatchObject({
      reason: 'PLAN_NOT_ELIGIBLE',
    });
    expect(checkPromotionEligibility({ ...promo, minAmount: 30000 }, ctx)).toMatchObject({ reason: 'MIN_AMOUNT' });
  });
});

describe('payment state machine', () => {
  it('only allows captured payments to be refunded', () => {
    expect(canTransitionPayment('PENDING', 'SUCCEEDED')).toBe(true);
    expect(canTransitionPayment('FAILED', 'SUCCEEDED')).toBe(false);
    expect(canTransitionPayment('SUCCEEDED', 'PENDING')).toBe(false);
    expect(canTransitionPayment('REFUNDED', 'SUCCEEDED')).toBe(false);
    expect(isPaymentCaptured('PENDING')).toBe(false);
    expect(isPaymentCaptured('PARTIALLY_REFUNDED')).toBe(true);
  });

  it('computes refund outcomes and blocks over-refunds', () => {
    const p = { status: 'SUCCEEDED' as const, amount: 10000 };
    expect(nextStatusAfterRefund(p, 0, 4000)).toEqual({ ok: true, status: 'PARTIALLY_REFUNDED' });
    expect(nextStatusAfterRefund(p, 4000, 6000)).toEqual({ ok: true, status: 'REFUNDED' });
    expect(nextStatusAfterRefund(p, 4000, 6001)).toMatchObject({ reason: 'EXCEEDS_CAPTURED' });
    expect(nextStatusAfterRefund({ ...p, status: 'PENDING' }, 0, 100)).toMatchObject({ reason: 'NOT_REFUNDABLE' });
    expect(nextStatusAfterRefund(p, 0, 0)).toMatchObject({ reason: 'INVALID_AMOUNT' });
  });
});

describe('timezone helpers', () => {
  it('uses the Almaty calendar day', () => {
    expect(localDateKey(new Date('2026-03-10T19:30:00Z'))).toBe('2026-03-11');
    expect(zonedDateTime('2026-03-11', 9 * 60).toISOString()).toBe('2026-03-11T04:00:00.000Z');
    expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01');
    expect(localWeekday(new Date('2026-03-09T12:00:00+05:00'))).toBe(0);
  });
});

describe('permissions', () => {
  it('gives owners and admins everything and members nothing', () => {
    expect(ROLE_PERMISSIONS.OWNER).toHaveLength(PERMISSIONS.length);
    expect(ROLE_PERMISSIONS.MEMBER).toHaveLength(0);
  });

  it('restricts sensitive capabilities', () => {
    expect(hasPermission('RECEPTIONIST', 'checkin.perform')).toBe(true);
    expect(hasPermission('RECEPTIONIST', 'checkin.override')).toBe(false);
    expect(hasPermission('RECEPTIONIST', 'payments.refund')).toBe(false);
    expect(hasPermission('TRAINER', 'members.read')).toBe(false);
    expect(hasPermission('TRAINER', 'training.manage_own')).toBe(true);
    expect(hasPermission('SALES', 'leads.read_all')).toBe(false);
    expect(hasPermission('MANAGER', 'staff.manage')).toBe(false);
    expect(hasPermission('MANAGER', 'payments.refund')).toBe(false);
    expect(hasPermission('MEMBER', 'dashboard.view')).toBe(false);
  });

  it('prevents self-promotion and peer/upward role changes', () => {
    const decide = (
      actorRole: 'OWNER' | 'ADMIN' | 'MANAGER',
      targetRole: 'ADMIN' | 'MANAGER' | 'OWNER' | null,
      nextRole: 'OWNER' | 'ADMIN' | 'MANAGER' | 'TRAINER',
      self = false,
    ) => canChangeStaffRole({ actorId: 'a', actorRole, targetId: self ? 'a' : 't', targetRole, nextRole });
    expect(decide('ADMIN', 'MANAGER', 'TRAINER')).toEqual({ allowed: true });
    expect(decide('ADMIN', 'ADMIN', 'TRAINER')).toMatchObject({ reason: 'RANK' });
    expect(decide('ADMIN', 'MANAGER', 'ADMIN')).toMatchObject({ reason: 'RANK' });
    expect(decide('ADMIN', 'MANAGER', 'OWNER')).toMatchObject({ reason: 'RANK' });
    expect(decide('MANAGER', null, 'TRAINER')).toMatchObject({ reason: 'NO_PERMISSION' });
    expect(decide('ADMIN', 'ADMIN', 'OWNER', true)).toMatchObject({ reason: 'SELF_CHANGE' });
    expect(decide('OWNER', 'ADMIN', 'OWNER')).toEqual({ allowed: true });
  });
});

describe('validation helpers', () => {
  it('normalises Kazakhstan phone numbers and rejects others', () => {
    expect(normalizeKzPhone('8 (701) 123-45-67')).toBe('+77011234567');
    expect(normalizeKzPhone('+7 727 250 00 00')).toBe('+77272500000');
    expect(normalizeKzPhone('7011234567')).toBe('+77011234567');
    expect(normalizeKzPhone('+7 916 123 45 67')).toBeNull();
    expect(normalizeKzPhone('12345')).toBeNull();
  });

  it('enforces password strength', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('onlyletterslong').success).toBe(false);
    expect(passwordSchema.safeParse('Strong-pass-2026').success).toBe(true);
    expect(passwordSchema.safeParse('құпиясөз2026').success).toBe(true);
  });
});

describe('notification templates', () => {
  it('has every template in every language and fills placeholders', () => {
    for (const templates of Object.values(NOTIFICATION_TEMPLATES)) {
      for (const locale of LOCALES) {
        expect(templates[locale].title.length).toBeGreaterThan(0);
        expect(templates[locale].body.length).toBeGreaterThan(0);
      }
    }
    expect(renderTemplate('BOOKING_CONFIRMED', 'en', { className: 'Yoga', when: 'Mon 09:00' }).body).toBe(
      'Yoga — Mon 09:00. See you there!',
    );
  });
});
