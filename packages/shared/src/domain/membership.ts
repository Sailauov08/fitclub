import type { MembershipStatus } from '../enums';
import { CLUB_TIMEZONE } from '../i18n';
import { addDaysToKey, localDateKey, zonedDateTime, MS_PER_DAY } from './dates';

/**
 * Membership lifecycle:
 *
 *   PENDING ──payment succeeded──▶ ACTIVE ──freeze starts──▶ FROZEN
 *      │                             │  ▲                       │
 *      │                             │  └──── freeze ends ──────┘
 *      └─payment failed/abandoned─▶ CANCELLED ◀── staff cancels ─┤
 *                                    ACTIVE ──end date passed──▶ EXPIRED
 *
 * EXPIRED and CANCELLED are terminal: a lapsed member buys a new membership.
 * Renewing an ACTIVE/FROZEN membership extends it instead of creating a second one.
 */
export const MEMBERSHIP_TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['FROZEN', 'EXPIRED', 'CANCELLED'],
  FROZEN: ['ACTIVE', 'CANCELLED'],
  EXPIRED: [],
  CANCELLED: [],
};

export function canTransitionMembership(from: MembershipStatus, to: MembershipStatus): boolean {
  return MEMBERSHIP_TRANSITIONS[from].includes(to);
}

export class MembershipTransitionError extends Error {
  constructor(
    readonly from: MembershipStatus,
    readonly to: MembershipStatus,
  ) {
    super(`Membership cannot move from ${from} to ${to}`);
  }
}

export function assertMembershipTransition(from: MembershipStatus, to: MembershipStatus): void {
  if (!canTransitionMembership(from, to)) throw new MembershipTransitionError(from, to);
}

/**
 * A membership bought for `durationDays` starting on local date `startKey` is valid
 * until local midnight after its last day: start 2026-01-01 + 30 days → ends 2026-01-31T00:00 local.
 */
export function computeMembershipPeriod(startKey: string, durationDays: number, timeZone: string = CLUB_TIMEZONE) {
  if (!Number.isInteger(durationDays) || durationDays < 1) throw new Error('durationDays must be a positive integer');
  return {
    startsAt: zonedDateTime(startKey, 0, timeZone),
    endsAt: zonedDateTime(addDaysToKey(startKey, durationDays), 0, timeZone),
  };
}

export function extendEndDate(endsAt: Date, days: number): Date {
  return new Date(endsAt.getTime() + days * MS_PER_DAY);
}

export type EligibilityReason =
  | 'NO_MEMBERSHIP'
  | 'PENDING_PAYMENT'
  | 'FROZEN'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'NOT_STARTED'
  | 'VISIT_LIMIT_REACHED'
  | 'BRANCH_NOT_ALLOWED'
  | 'CLASSES_NOT_INCLUDED';

export interface MembershipLike {
  status: MembershipStatus;
  startsAt: Date;
  endsAt: Date;
  visitLimit: number | null;
  visitsUsed: number;
  includesClasses: boolean;
  allBranches: boolean;
  branchIds: readonly string[];
}

export type EligibilityResult = { eligible: true } | { eligible: false; reason: EligibilityReason };

/**
 * Single source of truth for "may this membership be used right now".
 * Used by check-in (purpose 'visit') and class booking (purpose 'class', `at` = session start).
 */
export function checkMembershipEligibility(
  membership: MembershipLike | null | undefined,
  ctx: { at: Date; branchId: string; purpose: 'visit' | 'class'; now?: Date },
): EligibilityResult {
  if (!membership) return { eligible: false, reason: 'NO_MEMBERSHIP' };
  switch (membership.status) {
    case 'PENDING':
      return { eligible: false, reason: 'PENDING_PAYMENT' };
    case 'FROZEN':
      return { eligible: false, reason: 'FROZEN' };
    case 'EXPIRED':
      return { eligible: false, reason: 'EXPIRED' };
    case 'CANCELLED':
      return { eligible: false, reason: 'CANCELLED' };
    case 'ACTIVE':
      break;
  }
  const now = ctx.now ?? ctx.at;
  if (ctx.at.getTime() < membership.startsAt.getTime()) return { eligible: false, reason: 'NOT_STARTED' };
  if (ctx.at.getTime() >= membership.endsAt.getTime() || now.getTime() >= membership.endsAt.getTime()) {
    return { eligible: false, reason: 'EXPIRED' };
  }
  if (membership.visitLimit !== null && membership.visitsUsed >= membership.visitLimit) {
    return { eligible: false, reason: 'VISIT_LIMIT_REACHED' };
  }
  if (!membership.allBranches && !membership.branchIds.includes(ctx.branchId)) {
    return { eligible: false, reason: 'BRANCH_NOT_ALLOWED' };
  }
  if (ctx.purpose === 'class' && !membership.includesClasses) {
    return { eligible: false, reason: 'CLASSES_NOT_INCLUDED' };
  }
  return { eligible: true };
}

export function remainingVisits(m: Pick<MembershipLike, 'visitLimit' | 'visitsUsed'>): number | null {
  return m.visitLimit === null ? null : Math.max(0, m.visitLimit - m.visitsUsed);
}

export function daysRemaining(endsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / MS_PER_DAY));
}

export type FreezeRejection =
  | 'NOT_ACTIVE'
  | 'FREEZE_NOT_ALLOWED'
  | 'TOO_SHORT'
  | 'EXCEEDS_ALLOWANCE'
  | 'TOO_MANY_FREEZES'
  | 'START_IN_PAST'
  | 'START_TOO_FAR'
  | 'START_AFTER_END'
  | 'OVERLAPS_EXISTING';

export interface FreezePolicy {
  /** Total freeze days allowed per membership (from the plan snapshot). 0 = freezing disabled. */
  maxDays: number;
  /** Maximum number of separate freezes per membership. */
  maxTimes: number;
  /** Club-wide minimum length of a single freeze. */
  minDays: number;
  /** How far in advance a freeze may be scheduled. */
  maxAdvanceDays: number;
}

/**
 * Validates a freeze request. Dates are local calendar keys; the freeze covers
 * [startKey, startKey + days) and pushes the membership end date by `days`.
 */
export function validateFreezeRequest(params: {
  membership: { status: MembershipStatus; endsAt: Date; frozenDaysUsed: number; freezeCount: number };
  existing: readonly { startKey: string; endKey: string }[];
  startKey: string;
  days: number;
  policy: FreezePolicy;
  now: Date;
  timeZone?: string;
}): { ok: true } | { ok: false; reason: FreezeRejection } {
  const { membership, existing, startKey, days, policy, now } = params;
  const tz = params.timeZone ?? CLUB_TIMEZONE;
  if (membership.status !== 'ACTIVE') return { ok: false, reason: 'NOT_ACTIVE' };
  if (policy.maxDays <= 0 || policy.maxTimes <= 0) return { ok: false, reason: 'FREEZE_NOT_ALLOWED' };
  if (!Number.isInteger(days) || days < policy.minDays) return { ok: false, reason: 'TOO_SHORT' };
  if (membership.frozenDaysUsed + days > policy.maxDays) return { ok: false, reason: 'EXCEEDS_ALLOWANCE' };
  if (membership.freezeCount >= policy.maxTimes) return { ok: false, reason: 'TOO_MANY_FREEZES' };
  const todayKey = localDateKey(now, tz);
  if (startKey < todayKey) return { ok: false, reason: 'START_IN_PAST' };
  if (startKey > addDaysToKey(todayKey, policy.maxAdvanceDays)) return { ok: false, reason: 'START_TOO_FAR' };
  if (zonedDateTime(startKey, 0, tz).getTime() >= membership.endsAt.getTime()) {
    return { ok: false, reason: 'START_AFTER_END' };
  }
  const endKey = addDaysToKey(startKey, days);
  if (existing.some((f) => startKey < f.endKey && f.startKey < endKey))
    return { ok: false, reason: 'OVERLAPS_EXISTING' };
  return { ok: true };
}

/**
 * When a freeze ends early, the membership gives back the unused days.
 * Returns how many days were actually consumed (at least 1 once the freeze has started).
 */
export function consumedFreezeDays(startKey: string, plannedDays: number, endedOnKey: string): number {
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const end = Date.parse(`${endedOnKey}T00:00:00Z`);
  const used = Math.round((end - start) / MS_PER_DAY);
  return Math.min(plannedDays, Math.max(1, used));
}
