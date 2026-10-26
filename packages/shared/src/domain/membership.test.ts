import { describe, expect, it } from 'vitest';
import {
  assertMembershipTransition,
  canTransitionMembership,
  checkMembershipEligibility,
  computeMembershipPeriod,
  consumedFreezeDays,
  daysRemaining,
  remainingVisits,
  validateFreezeRequest,
  type MembershipLike,
} from './membership';
import { localDateKey } from './dates';

const base: MembershipLike = {
  status: 'ACTIVE',
  startsAt: new Date('2026-01-01T00:00:00+05:00'),
  endsAt: new Date('2026-01-31T00:00:00+05:00'),
  visitLimit: null,
  visitsUsed: 0,
  includesClasses: true,
  allBranches: false,
  branchIds: ['b1'],
};
const at = new Date('2026-01-15T10:00:00+05:00');

describe('membership transitions', () => {
  it('allows only the documented transitions', () => {
    expect(canTransitionMembership('PENDING', 'ACTIVE')).toBe(true);
    expect(canTransitionMembership('ACTIVE', 'FROZEN')).toBe(true);
    expect(canTransitionMembership('FROZEN', 'ACTIVE')).toBe(true);
    expect(canTransitionMembership('ACTIVE', 'EXPIRED')).toBe(true);
    expect(canTransitionMembership('EXPIRED', 'ACTIVE')).toBe(false);
    expect(canTransitionMembership('CANCELLED', 'ACTIVE')).toBe(false);
    expect(canTransitionMembership('PENDING', 'FROZEN')).toBe(false);
    expect(canTransitionMembership('FROZEN', 'EXPIRED')).toBe(false);
  });

  it('throws on invalid transitions', () => {
    expect(() => assertMembershipTransition('EXPIRED', 'ACTIVE')).toThrow(/EXPIRED to ACTIVE/);
  });
});

describe('computeMembershipPeriod', () => {
  it('ends at local midnight after the last day in Asia/Almaty (UTC+5)', () => {
    const { startsAt, endsAt } = computeMembershipPeriod('2026-01-01', 30);
    expect(startsAt.toISOString()).toBe('2025-12-31T19:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2026-01-30T19:00:00.000Z');
    expect(localDateKey(new Date(endsAt.getTime() - 1))).toBe('2026-01-30');
  });

  it('rejects non-positive durations', () => {
    expect(() => computeMembershipPeriod('2026-01-01', 0)).toThrow();
  });
});

describe('checkMembershipEligibility', () => {
  const ctx = { at, branchId: 'b1', purpose: 'visit' as const };

  it('accepts an active membership in its home branch', () => {
    expect(checkMembershipEligibility(base, ctx)).toEqual({ eligible: true });
  });

  it.each([
    ['PENDING', 'PENDING_PAYMENT'],
    ['FROZEN', 'FROZEN'],
    ['EXPIRED', 'EXPIRED'],
    ['CANCELLED', 'CANCELLED'],
  ] as const)('rejects %s memberships', (status, reason) => {
    expect(checkMembershipEligibility({ ...base, status }, ctx)).toEqual({ eligible: false, reason });
  });

  it('rejects when there is no membership', () => {
    expect(checkMembershipEligibility(null, ctx)).toEqual({ eligible: false, reason: 'NO_MEMBERSHIP' });
  });

  it('rejects before the start date and at/after the end instant', () => {
    expect(checkMembershipEligibility(base, { ...ctx, at: new Date('2025-12-31T18:59:59Z') })).toMatchObject({
      reason: 'NOT_STARTED',
    });
    expect(checkMembershipEligibility(base, { ...ctx, at: base.endsAt })).toMatchObject({ reason: 'EXPIRED' });
  });

  it('rejects a class that starts after expiry even if booked earlier', () => {
    const now = new Date('2026-01-29T10:00:00+05:00');
    const sessionStart = new Date('2026-01-31T09:00:00+05:00');
    expect(checkMembershipEligibility(base, { at: sessionStart, now, branchId: 'b1', purpose: 'class' })).toMatchObject(
      { reason: 'EXPIRED' },
    );
  });

  it('enforces visit limits', () => {
    expect(checkMembershipEligibility({ ...base, visitLimit: 8, visitsUsed: 7 }, ctx)).toEqual({ eligible: true });
    expect(checkMembershipEligibility({ ...base, visitLimit: 8, visitsUsed: 8 }, ctx)).toMatchObject({
      reason: 'VISIT_LIMIT_REACHED',
    });
  });

  it('enforces branch access unless the plan covers all branches', () => {
    expect(checkMembershipEligibility(base, { ...ctx, branchId: 'b2' })).toMatchObject({
      reason: 'BRANCH_NOT_ALLOWED',
    });
    expect(checkMembershipEligibility({ ...base, allBranches: true }, { ...ctx, branchId: 'b2' })).toEqual({
      eligible: true,
    });
  });

  it('requires class access for bookings only', () => {
    const gymOnly = { ...base, includesClasses: false };
    expect(checkMembershipEligibility(gymOnly, ctx)).toEqual({ eligible: true });
    expect(checkMembershipEligibility(gymOnly, { ...ctx, purpose: 'class' })).toMatchObject({
      reason: 'CLASSES_NOT_INCLUDED',
    });
  });
});

describe('helpers', () => {
  it('computes remaining visits and days', () => {
    expect(remainingVisits({ visitLimit: null, visitsUsed: 4 })).toBeNull();
    expect(remainingVisits({ visitLimit: 12, visitsUsed: 4 })).toBe(8);
    expect(remainingVisits({ visitLimit: 12, visitsUsed: 14 })).toBe(0);
    expect(daysRemaining(base.endsAt, at)).toBe(16);
    expect(daysRemaining(base.endsAt, new Date('2026-03-01'))).toBe(0);
  });

  it('counts consumed freeze days, at least one, at most planned', () => {
    expect(consumedFreezeDays('2026-02-01', 14, '2026-02-06')).toBe(5);
    expect(consumedFreezeDays('2026-02-01', 14, '2026-02-01')).toBe(1);
    expect(consumedFreezeDays('2026-02-01', 14, '2026-03-01')).toBe(14);
  });
});

describe('validateFreezeRequest', () => {
  const now = new Date('2026-01-10T12:00:00+05:00');
  const policy = { maxDays: 30, maxTimes: 2, minDays: 7, maxAdvanceDays: 30 };
  const membership = { status: 'ACTIVE' as const, endsAt: base.endsAt, frozenDaysUsed: 0, freezeCount: 0 };
  const run = (overrides: Partial<Parameters<typeof validateFreezeRequest>[0]> = {}) =>
    validateFreezeRequest({ membership, existing: [], startKey: '2026-01-12', days: 10, policy, now, ...overrides });

  it('accepts a valid request', () => expect(run()).toEqual({ ok: true }));
  it('rejects inactive memberships', () =>
    expect(run({ membership: { ...membership, status: 'FROZEN' } })).toMatchObject({ reason: 'NOT_ACTIVE' }));
  it('rejects plans without freeze allowance', () =>
    expect(run({ policy: { ...policy, maxDays: 0 } })).toMatchObject({ reason: 'FREEZE_NOT_ALLOWED' }));
  it('rejects freezes shorter than the minimum', () => expect(run({ days: 3 })).toMatchObject({ reason: 'TOO_SHORT' }));
  it('rejects exceeding total allowance', () =>
    expect(run({ membership: { ...membership, frozenDaysUsed: 25 } })).toMatchObject({ reason: 'EXCEEDS_ALLOWANCE' }));
  it('rejects too many freezes', () =>
    expect(run({ membership: { ...membership, freezeCount: 2 } })).toMatchObject({ reason: 'TOO_MANY_FREEZES' }));
  it('rejects start dates in the past', () =>
    expect(run({ startKey: '2026-01-09' })).toMatchObject({ reason: 'START_IN_PAST' }));
  it('rejects start dates too far ahead', () =>
    expect(run({ startKey: '2026-03-01' })).toMatchObject({ reason: 'START_TOO_FAR' }));
  it('rejects start dates after the membership ends', () =>
    expect(run({ startKey: '2026-01-31' })).toMatchObject({ reason: 'START_AFTER_END' }));
  it('rejects overlapping freezes', () =>
    expect(run({ existing: [{ startKey: '2026-01-15', endKey: '2026-01-22' }] })).toMatchObject({
      reason: 'OVERLAPS_EXISTING',
    }));
});
