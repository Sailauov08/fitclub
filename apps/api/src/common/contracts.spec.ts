import * as shared from '@fitclub/shared';
import * as db from '../generated/prisma/enums';
import { renderNotification } from '../modules/notifications/render';
import { sniffImageType } from '../modules/media/storage.service';
import { hmac, safeEqual, sha256 } from './crypto';

/** The shared package duplicates Prisma enums for the web app; this keeps both in sync. */
describe('shared enums match the database schema', () => {
  const pairs: [readonly string[], Record<string, string>][] = [
    [shared.STAFF_ROLES, db.StaffRole],
    [shared.MEMBERSHIP_STATUSES, db.MembershipStatus],
    [shared.PLAN_TYPES, db.PlanType],
    [shared.MEMBERSHIP_EVENT_TYPES, db.MembershipEventType],
    [shared.FREEZE_STATUSES, db.FreezeStatus],
    [shared.DIFFICULTIES, db.Difficulty],
    [shared.SESSION_STATUSES, db.SessionStatus],
    [shared.BOOKING_STATUSES, db.BookingStatus],
    [shared.WAITLIST_STATUSES, db.WaitlistStatus],
    [shared.CHECKIN_METHODS, db.CheckInMethod],
    [shared.PAYMENT_STATUSES, db.PaymentStatus],
    [shared.PAYMENT_PURPOSES, db.PaymentPurpose],
    [shared.PAYMENT_PROVIDERS, db.PaymentProvider],
    [shared.PAYMENT_METHODS, db.PaymentMethod],
    [shared.RECONCILIATION_STATUSES, db.ReconciliationStatus],
    [shared.PROMOTION_TYPES, db.PromotionType],
    [shared.LEAD_SOURCES, db.LeadSource],
    [shared.LEAD_STATUSES, db.LeadStatus],
    [shared.LEAD_ACTIVITY_TYPES, db.LeadActivityType],
    [shared.EXERCISE_CATEGORIES, db.ExerciseCategory],
    [shared.ASSIGNMENT_STATUSES, db.AssignmentStatus],
  ];
  it.each(pairs.map(([a, b], i) => [i, a, b] as const))('pair %i', (_i, sharedValues, dbEnum) => {
    expect([...sharedValues].sort()).toEqual(Object.values(dbEnum).sort());
  });
});

describe('notification rendering', () => {
  it('renders localized names, dates and amounts per locale', () => {
    const data = { planName: { kk: 'Шексіз', ru: 'Безлимит', en: 'Unlimited' }, endsOn: '2026-03-31' };
    expect(renderNotification('MEMBERSHIP_ACTIVATED', 'en', data).body).toBe(
      '"Unlimited" is valid until 31 March 2026.',
    );
    expect(renderNotification('MEMBERSHIP_ACTIVATED', 'ru', data).body).toContain('«Безлимит»');
    expect(
      renderNotification('PAYMENT_SUCCEEDED', 'ru', { amount: 25000, invoiceNumber: 'FC-2026-000001' }).body,
    ).toMatch(/25\s000\s₸/);
  });
});

describe('security helpers', () => {
  it('detects image types from magic bytes, not from names', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImageType(Buffer.from('GIF89a'))).toBeNull();
  });

  it('hashes and compares tokens safely', () => {
    expect(sha256('abc')).toHaveLength(64);
    expect(hmac('k', 'v')).toBe(hmac('k', 'v'));
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'ab')).toBe(false);
  });
});
