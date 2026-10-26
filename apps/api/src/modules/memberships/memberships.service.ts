import { Injectable, Logger } from '@nestjs/common';
import {
  addDaysToKey,
  canTransitionMembership,
  computeMembershipPeriod,
  consumedFreezeDays,
  extendEndDate,
  localDateKey,
  validateFreezeRequest,
  zonedDateTime,
  type LocalizedText,
  type MembershipStatus,
} from '@fitclub/shared';
import { Prisma, type MembershipPlan } from '../../generated/prisma/client';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AppError, conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { dbDateToKey, keyToDbDate, todayKey } from '../../common/dates';
import { assertBranchAccess, type AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { BookingsService } from '../bookings/bookings.service';

export interface PlanSnapshot {
  code: string;
  name: LocalizedText;
  type: string;
  durationDays: number;
  price: number;
  visitLimit: number | null;
  includesClasses: boolean;
  allBranches: boolean;
  branchIds: string[];
  freezeMaxDays: number;
  freezeMaxTimes: number;
  version: number;
}

export function snapshotPlan(plan: MembershipPlan & { branches: { branchId: string }[] }): PlanSnapshot {
  return {
    code: plan.code,
    name: plan.name as LocalizedText,
    type: plan.type,
    durationDays: plan.durationDays,
    price: plan.price,
    visitLimit: plan.visitLimit,
    includesClasses: plan.includesClasses,
    allBranches: plan.allBranches,
    branchIds: plan.branches.map((b) => b.branchId),
    freezeMaxDays: plan.freezeMaxDays,
    freezeMaxTimes: plan.freezeMaxTimes,
    version: plan.version,
  };
}

const STATUS_PRIORITY: Record<MembershipStatus, number> = {
  ACTIVE: 0,
  FROZEN: 1,
  PENDING: 2,
  EXPIRED: 3,
  CANCELLED: 4,
};

/**
 * All membership state changes go through this service. Each change:
 *  - checks the transition against the shared state machine,
 *  - uses optimistic concurrency (`version`) so two staff members cannot clobber each other,
 *  - writes a MembershipEvent (member-visible history) and an AuditLog entry (staff actions).
 */
@Injectable()
export class MembershipsService {
  private readonly logger = new Logger('Memberships');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly bookings: BookingsService,
  ) {}

  /** Guarded state change; throws CONFLICT if the row changed concurrently or the transition is invalid. */
  private async transition(
    tx: Tx,
    membership: { id: string; status: MembershipStatus; version: number },
    to: MembershipStatus,
    data: Prisma.MembershipUpdateManyMutationInput = {},
  ) {
    if (!canTransitionMembership(membership.status, to)) {
      throw conflict('MEMBERSHIP_TRANSITION_INVALID', `Membership cannot move from ${membership.status} to ${to}`, {
        from: membership.status,
        to,
      });
    }
    const updated = await tx.membership.updateMany({
      where: { id: membership.id, version: membership.version, status: membership.status },
      data: { ...data, status: to, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw conflict('CONFLICT', 'The membership was changed by someone else. Please reload.');
  }

  async findOrThrow(id: string, tx: Tx = this.prisma) {
    const m = await tx.membership.findUnique({
      where: { id },
      include: { member: { select: { userId: true, homeBranchId: true } } },
    });
    if (!m) throw notFound('Membership');
    return m;
  }

  /** Creates a PENDING membership for a sale. A stale pending sale of the same plan is cancelled first. */
  async createPending(
    tx: Tx,
    params: {
      memberId: string;
      plan: MembershipPlan & { branches: { branchId: string }[] };
      startKey?: string;
      soldById?: string | null;
      price: number;
    },
  ) {
    const { memberId, plan } = params;
    const open = await tx.membership.findFirst({
      where: { memberId, planId: plan.id, status: { in: ['PENDING', 'ACTIVE', 'FROZEN'] } },
    });
    if (open && open.status !== 'PENDING') {
      throw conflict('MEMBERSHIP_ALREADY_ACTIVE', 'This plan is already active — renew it instead', {
        membershipId: open.id,
      });
    }
    if (open) {
      await tx.payment.updateMany({
        where: { membershipId: open.id, status: { in: ['PENDING', 'REQUIRES_ACTION'] } },
        data: { status: 'CANCELLED' },
      });
      await this.transition(tx, open, 'CANCELLED', {
        cancelledAt: new Date(),
        cancelReason: 'Superseded by a new checkout',
      });
    }
    const startKey = params.startKey ?? todayKey();
    const period = computeMembershipPeriod(startKey, plan.durationDays);
    const snapshot = snapshotPlan(plan);
    const membership = await tx.membership.create({
      data: {
        memberId,
        planId: plan.id,
        status: 'PENDING',
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        planSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        planVersion: plan.version,
        price: params.price,
        visitLimit: plan.visitLimit,
        includesClasses: plan.includesClasses,
        allBranches: plan.allBranches,
        branchIds: snapshot.branchIds,
        freezeMaxDays: plan.freezeMaxDays,
        freezeMaxTimes: plan.freezeMaxTimes,
        soldById: params.soldById ?? null,
        events: {
          create: {
            type: 'CREATED',
            actorId: params.soldById ?? null,
            data: { planCode: plan.code, price: params.price },
          },
        },
      },
    });
    return membership;
  }

  /**
   * PENDING → ACTIVE once payment is confirmed. If payment arrived after the planned start
   * date, the period is shifted to start today so the member never loses paid days.
   */
  async activate(tx: Tx, membershipId: string, actorId: string | null) {
    const m = await this.findOrThrow(membershipId, tx);
    const snapshot = m.planSnapshot as unknown as PlanSnapshot;
    const today = todayKey();
    let period = { startsAt: m.startsAt, endsAt: m.endsAt };
    if (localDateKey(m.startsAt) < today) period = computeMembershipPeriod(today, snapshot.durationDays);
    await this.transition(tx, m, 'ACTIVE', {
      activatedAt: new Date(),
      startsAt: period.startsAt,
      endsAt: period.endsAt,
    });
    await tx.membershipEvent.create({
      data: { membershipId, type: 'ACTIVATED', actorId, data: { endsAt: period.endsAt.toISOString() } },
    });
    return { userId: m.member.userId, planName: snapshot.name, endsAt: period.endsAt };
  }

  async notifyActivated(result: { userId: string; planName: LocalizedText; endsAt: Date }) {
    await this.notifications.notify(result.userId, 'MEMBERSHIP_ACTIVATED', {
      planName: result.planName,
      endsOn: localDateKey(new Date(result.endsAt.getTime() - 1)),
    });
  }

  /** PENDING → CANCELLED when its payment failed or expired. */
  async abandonPending(tx: Tx, membershipId: string, reason: string) {
    const m = await this.findOrThrow(membershipId, tx);
    if (m.status !== 'PENDING') return;
    await this.transition(tx, m, 'CANCELLED', { cancelledAt: new Date(), cancelReason: reason });
    await tx.membershipEvent.create({ data: { membershipId, type: 'CANCELLED', data: { reason } } });
  }

  /** Renewal of an ACTIVE/FROZEN membership: extends the end date and adds the plan's visits. */
  async applyRenewal(
    tx: Tx,
    membershipId: string,
    actorId: string | null,
    renewal: { days: number; visits: number | null; paymentId: string },
  ) {
    const m = await this.findOrThrow(membershipId, tx);
    if (m.status !== 'ACTIVE' && m.status !== 'FROZEN') {
      throw conflict('MEMBERSHIP_NOT_RENEWABLE', 'Only active or frozen memberships can be renewed');
    }
    const endsAt = extendEndDate(m.endsAt, renewal.days);
    const updated = await tx.membership.updateMany({
      where: { id: m.id, version: m.version },
      data: {
        endsAt,
        visitLimit: m.visitLimit !== null && renewal.visits !== null ? m.visitLimit + renewal.visits : m.visitLimit,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw conflict('CONFLICT', 'The membership was changed by someone else. Please reload.');
    await tx.membershipEvent.create({
      data: {
        membershipId,
        type: 'RENEWED',
        actorId,
        data: {
          days: renewal.days,
          visits: renewal.visits,
          paymentId: renewal.paymentId,
          endsAt: endsAt.toISOString(),
        },
      },
    });
    const snapshot = m.planSnapshot as unknown as PlanSnapshot;
    return { userId: m.member.userId, planName: snapshot.name, endsAt };
  }

  // ───────────── Freezes ─────────────

  async freeze(
    actor: AuthUser,
    membershipId: string,
    input: { startDate: string; days: number; reason?: string },
    opts: { selfService: boolean },
  ) {
    const settings = await this.settings.get();
    if (opts.selfService && !settings.membershipPolicy.memberSelfFreeze) {
      throw forbidden('Freezing is handled by the front desk');
    }
    const result = await this.prisma.transaction(async (tx) => {
      const m = await this.findOrThrow(membershipId, tx);
      if (opts.selfService && m.memberId !== actor.memberId) throw notFound('Membership');
      if (!opts.selfService) assertBranchAccess(actor, m.member.homeBranchId);
      const pending = await tx.membershipFreeze.findMany({
        where: { membershipId, status: { in: ['SCHEDULED', 'ACTIVE'] } },
      });
      const scheduled = pending.filter((f) => f.status === 'SCHEDULED');
      const decision = validateFreezeRequest({
        membership: {
          status: m.status,
          endsAt: m.endsAt,
          frozenDaysUsed: m.frozenDaysUsed + scheduled.reduce((s, f) => s + f.days, 0),
          freezeCount: m.freezeCount + scheduled.length,
        },
        existing: pending.map((f) => ({ startKey: dbDateToKey(f.startDate), endKey: dbDateToKey(f.endDate) })),
        startKey: input.startDate,
        days: input.days,
        policy: {
          maxDays: m.freezeMaxDays,
          maxTimes: m.freezeMaxTimes,
          minDays: settings.membershipPolicy.minFreezeDays,
          maxAdvanceDays: settings.membershipPolicy.maxFreezeAdvanceDays,
        },
        now: new Date(),
      });
      if (!decision.ok) throw unprocessable('FREEZE_REJECTED', 'Freeze request rejected', { reason: decision.reason });

      const endKey = addDaysToKey(input.startDate, input.days);
      const freeze = await tx.membershipFreeze.create({
        data: {
          membershipId,
          startDate: keyToDbDate(input.startDate),
          endDate: keyToDbDate(endKey),
          days: input.days,
          reason: input.reason,
          createdById: actor.id,
        },
      });
      await tx.membershipEvent.create({
        data: {
          membershipId,
          type: 'FREEZE_SCHEDULED',
          actorId: actor.id,
          data: { startDate: input.startDate, days: input.days },
        },
      });
      // Bookings inside the freeze window can no longer be used — release the seats now.
      const released = await this.bookings.cancelMemberBookingsInRange(
        tx,
        m.memberId,
        zonedDateTime(input.startDate),
        zonedDateTime(endKey),
        'membership frozen',
      );
      return { freeze, membership: m, released };
    });

    await this.audit.log(actor, {
      action: opts.selfService ? 'membership.freeze_self' : 'membership.freeze',
      entityType: 'Membership',
      entityId: membershipId,
      metadata: { startDate: input.startDate, days: input.days },
    });
    await this.bookings.promoteWaitlists(result.released);
    if (input.startDate <= todayKey()) await this.processFreezes();
    const fresh = await this.findOrThrow(membershipId);
    await this.notifications.notify(fresh.member.userId, 'MEMBERSHIP_FROZEN', {
      startsOn: input.startDate,
      days: input.days,
      // Once the freeze has started the stored end date already includes it.
      endsOn: localDateKey(
        new Date(extendEndDate(fresh.endsAt, fresh.status === 'FROZEN' ? 0 : input.days).getTime() - 1),
      ),
    });
    return result.freeze;
  }

  async cancelScheduledFreeze(actor: AuthUser, freezeId: string, opts: { selfService: boolean }) {
    const freeze = await this.prisma.membershipFreeze.findUnique({
      where: { id: freezeId },
      include: { membership: { include: { member: true } } },
    });
    if (!freeze || (opts.selfService && freeze.membership.memberId !== actor.memberId)) throw notFound('Freeze');
    if (!opts.selfService) assertBranchAccess(actor, freeze.membership.member.homeBranchId);
    if (freeze.status !== 'SCHEDULED')
      throw conflict('FREEZE_REJECTED', 'Only scheduled freezes can be cancelled', { reason: 'NOT_SCHEDULED' });
    await this.prisma.$transaction([
      this.prisma.membershipFreeze.update({
        where: { id: freezeId },
        data: { status: 'CANCELLED', endedAt: new Date() },
      }),
      this.prisma.membershipEvent.create({
        data: { membershipId: freeze.membershipId, type: 'FREEZE_CANCELLED', actorId: actor.id },
      }),
    ]);
    await this.audit.log(actor, {
      action: 'membership.freeze_cancel',
      entityType: 'MembershipFreeze',
      entityId: freezeId,
    });
  }

  /** Ends an active freeze early; unused days are given back (end date pulled in). */
  async unfreeze(
    actor: AuthUser | null,
    membershipId: string,
    opts: { selfService: boolean } = { selfService: false },
  ) {
    const out = await this.prisma.transaction(async (tx) => {
      const m = await this.findOrThrow(membershipId, tx);
      if (actor && opts.selfService && m.memberId !== actor.memberId) throw notFound('Membership');
      if (actor && !opts.selfService) assertBranchAccess(actor, m.member.homeBranchId);
      const freeze = await tx.membershipFreeze.findFirst({ where: { membershipId, status: 'ACTIVE' } });
      if (m.status !== 'FROZEN' || !freeze) throw conflict('MEMBERSHIP_TRANSITION_INVALID', 'Membership is not frozen');
      const today = todayKey();
      const used = consumedFreezeDays(dbDateToKey(freeze.startDate), freeze.days, today);
      const unused = freeze.days - used;
      const endsAt = extendEndDate(m.endsAt, -unused);
      await tx.membershipFreeze.update({
        where: { id: freeze.id },
        data: { status: 'COMPLETED', daysUsed: used, endedAt: new Date() },
      });
      await this.transition(tx, m, 'ACTIVE', { endsAt, frozenDaysUsed: { decrement: unused } });
      await tx.membershipEvent.create({
        data: {
          membershipId,
          type: 'UNFROZEN',
          actorId: actor?.id ?? null,
          data: { daysUsed: used, endsAt: endsAt.toISOString() },
        },
      });
      return { m, endsAt };
    });
    if (actor)
      await this.audit.log(actor, { action: 'membership.unfreeze', entityType: 'Membership', entityId: membershipId });
    await this.notifications.notify(out.m.member.userId, 'MEMBERSHIP_UNFROZEN', {
      planName: (out.m.planSnapshot as unknown as PlanSnapshot).name,
      endsOn: localDateKey(new Date(out.endsAt.getTime() - 1)),
    });
  }

  /** Job: start scheduled freezes whose start date arrived; complete freezes whose end date passed. */
  async processFreezes(now = new Date()) {
    const today = keyToDbDate(todayKey(now));
    const toStart = await this.prisma.membershipFreeze.findMany({
      where: { status: 'SCHEDULED', startDate: { lte: today } },
    });
    for (const f of toStart) {
      try {
        await this.prisma.transaction(async (tx) => {
          const m = await this.findOrThrow(f.membershipId, tx);
          if (m.status !== 'ACTIVE') {
            await tx.membershipFreeze.update({
              where: { id: f.id },
              data: { status: 'CANCELLED', endedAt: new Date() },
            });
            return;
          }
          await tx.membershipFreeze.update({ where: { id: f.id }, data: { status: 'ACTIVE' } });
          await this.transition(tx, m, 'FROZEN', {
            endsAt: extendEndDate(m.endsAt, f.days),
            frozenDaysUsed: { increment: f.days },
            freezeCount: { increment: 1 },
          });
          await tx.membershipEvent.create({
            data: { membershipId: m.id, type: 'FROZEN', data: { days: f.days, freezeId: f.id } },
          });
        });
      } catch (error) {
        this.logger.warn({ err: error, freezeId: f.id }, 'Could not start freeze');
      }
    }
    const toEnd = await this.prisma.membershipFreeze.findMany({ where: { status: 'ACTIVE', endDate: { lte: today } } });
    for (const f of toEnd) {
      try {
        await this.prisma.transaction(async (tx) => {
          const m = await this.findOrThrow(f.membershipId, tx);
          await tx.membershipFreeze.update({
            where: { id: f.id },
            data: { status: 'COMPLETED', daysUsed: f.days, endedAt: new Date() },
          });
          if (m.status === 'FROZEN') {
            await this.transition(tx, m, 'ACTIVE');
            await tx.membershipEvent.create({
              data: { membershipId: m.id, type: 'UNFROZEN', data: { daysUsed: f.days } },
            });
          }
        });
      } catch (error) {
        this.logger.warn({ err: error, freezeId: f.id }, 'Could not complete freeze');
      }
    }
    return { started: toStart.length, completed: toEnd.length };
  }

  // ───────────── Staff operations ─────────────

  async extend(actor: AuthUser, membershipId: string, days: number, reason: string) {
    const m = await this.findOrThrow(membershipId);
    assertBranchAccess(actor, m.member.homeBranchId);
    if (m.status !== 'ACTIVE' && m.status !== 'FROZEN')
      throw conflict('MEMBERSHIP_TRANSITION_INVALID', 'Only active or frozen memberships can be extended');
    const endsAt = extendEndDate(m.endsAt, days);
    await this.prisma.transaction(async (tx) => {
      const updated = await tx.membership.updateMany({
        where: { id: m.id, version: m.version },
        data: { endsAt, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw conflict('CONFLICT', 'The membership was changed by someone else. Please reload.');
      await tx.membershipEvent.create({
        data: {
          membershipId,
          type: 'EXTENDED',
          actorId: actor.id,
          data: { days, reason, endsAt: endsAt.toISOString() },
        },
      });
    });
    await this.audit.log(actor, {
      action: 'membership.extend',
      entityType: 'Membership',
      entityId: membershipId,
      metadata: { days, reason },
    });
    await this.notifications.notify(m.member.userId, 'MEMBERSHIP_EXTENDED', {
      planName: (m.planSnapshot as unknown as PlanSnapshot).name,
      endsOn: localDateKey(new Date(endsAt.getTime() - 1)),
    });
  }

  async cancel(actor: AuthUser, membershipId: string, reason: string) {
    const released = await this.prisma.transaction(async (tx) => {
      const m = await this.findOrThrow(membershipId, tx);
      assertBranchAccess(actor, m.member.homeBranchId);
      await this.transition(tx, m, 'CANCELLED', { cancelledAt: new Date(), cancelReason: reason });
      await tx.membershipFreeze.updateMany({
        where: { membershipId, status: { in: ['SCHEDULED', 'ACTIVE'] } },
        data: { status: 'CANCELLED', endedAt: new Date() },
      });
      await tx.membershipEvent.create({
        data: { membershipId, type: 'CANCELLED', actorId: actor.id, data: { reason } },
      });
      const ids = await this.bookings.cancelMemberBookingsInRange(
        tx,
        m.memberId,
        new Date(),
        new Date('2100-01-01'),
        'membership cancelled',
        membershipId,
      );
      return { ids, m };
    });
    await this.audit.log(actor, {
      action: 'membership.cancel',
      entityType: 'Membership',
      entityId: membershipId,
      metadata: { reason },
    });
    await this.bookings.promoteWaitlists(released.ids);
    await this.notifications.notify(released.m.member.userId, 'MEMBERSHIP_CANCELLED', {
      planName: (released.m.planSnapshot as unknown as PlanSnapshot).name,
    });
  }

  /** Job: ACTIVE memberships past their end → EXPIRED. Frozen memberships cannot expire (their end moves). */
  async expireDue(now = new Date()) {
    const due = await this.prisma.membership.findMany({
      where: { status: 'ACTIVE', endsAt: { lte: now } },
      include: { member: true },
    });
    for (const m of due) {
      try {
        await this.prisma.transaction(async (tx) => {
          await this.transition(tx, m, 'EXPIRED', { expiredAt: now });
          await tx.membershipEvent.create({ data: { membershipId: m.id, type: 'EXPIRED' } });
        });
        await this.notifications.notify(
          m.member.userId,
          'MEMBERSHIP_EXPIRED',
          { planName: (m.planSnapshot as unknown as PlanSnapshot).name },
          { dedupeKey: `expired:${m.id}` },
        );
      } catch (error) {
        if (!(error instanceof AppError)) this.logger.warn({ err: error, id: m.id }, 'Could not expire membership');
      }
    }
    return due.length;
  }

  /** Job: reminders N days before the end date (configured in settings), idempotent per membership/day. */
  async sendExpiryReminders(now = new Date()) {
    const { membershipPolicy } = await this.settings.get();
    let sent = 0;
    for (const days of membershipPolicy.expiryReminderDays) {
      const dayKey = addDaysToKey(todayKey(now), days);
      const window = { gte: zonedDateTime(dayKey), lt: zonedDateTime(addDaysToKey(dayKey, 1)) };
      const ending = await this.prisma.membership.findMany({
        where: { status: 'ACTIVE', endsAt: window },
        include: { member: true },
      });
      for (const m of ending) {
        await this.notifications.notify(
          m.member.userId,
          'MEMBERSHIP_EXPIRING',
          {
            planName: (m.planSnapshot as unknown as PlanSnapshot).name,
            endsOn: localDateKey(new Date(m.endsAt.getTime() - 1)),
            days,
          },
          { dedupeKey: `expiring:${m.id}:${days}:${dbDateToKey(m.endsAt)}` },
        );
        sent += 1;
      }
    }
    return sent;
  }

  // ───────────── Queries ─────────────

  /** The membership a member would use right now: ACTIVE first, then FROZEN, then PENDING. */
  async currentForMember(memberId: string, tx: Tx = this.prisma) {
    const list = await tx.membership.findMany({
      where: { memberId, status: { in: ['ACTIVE', 'FROZEN', 'PENDING'] } },
      orderBy: { endsAt: 'desc' },
    });
    return list.sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status])[0] ?? null;
  }

  async listForMember(memberId: string) {
    return this.prisma.membership.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      include: {
        freezes: { orderBy: { startDate: 'desc' } },
        events: { orderBy: { createdAt: 'desc' }, take: 30 },
        payments: {
          select: {
            id: true,
            amount: true,
            status: true,
            method: true,
            paidAt: true,
            isTest: true,
            purpose: true,
            createdAt: true,
          },
        },
      },
    });
  }
}
