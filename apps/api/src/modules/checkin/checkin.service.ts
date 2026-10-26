import { HttpStatus, Injectable } from '@nestjs/common';
import { checkMembershipEligibility, remainingVisits, type EligibilityReason } from '@fitclub/shared';
import { env } from '../../config/env';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AppError, conflict, notFound } from '../../common/errors';
import { hmac, safeEqual } from '../../common/crypto';
import { keyToDbDate, todayKey } from '../../common/dates';
import { assertBranchAccess, type AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { Prisma, type CheckInMethod } from '../../generated/prisma/client';

const QR_TTL_SECONDS = 120;
const QR_PREFIX = 'FC1';

/**
 * Member QR codes are short-lived signed tokens: FC1.<memberId>.<expiry>.<HMAC-SHA256>.
 * They cannot be forged without the server secret, expire after two minutes (a screenshot
 * stops working quickly) and can be revoked for a member by bumping `qrVersion`.
 * A QR code only identifies the member — eligibility is always re-checked server-side.
 */
@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private sign(memberId: string, exp: number, version: number) {
    return hmac(env.QR_SIGNING_SECRET, `${QR_PREFIX}.${memberId}.${exp}.${version}`);
  }

  async issueToken(memberId: string) {
    const member = await this.prisma.member.findUniqueOrThrow({ where: { id: memberId } });
    const exp = Math.floor(Date.now() / 1000) + QR_TTL_SECONDS;
    return {
      token: `${QR_PREFIX}.${memberId}.${exp}.${this.sign(memberId, exp, member.qrVersion)}`,
      expiresAt: new Date(exp * 1000),
    };
  }

  async verifyToken(token: string): Promise<string> {
    const parts = token.trim().split('.');
    if (parts.length !== 4 || parts[0] !== QR_PREFIX)
      throw new AppError('QR_INVALID', HttpStatus.BAD_REQUEST, 'This QR code is not a FITCLUB member code');
    const [, memberId, expRaw, sig] = parts as [string, string, string, string];
    const exp = Number(expRaw);
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || !Number.isFinite(exp) || !safeEqual(sig, this.sign(memberId, exp, member.qrVersion))) {
      throw new AppError('QR_INVALID', HttpStatus.BAD_REQUEST, 'Invalid QR code');
    }
    if (exp * 1000 < Date.now())
      throw new AppError('QR_EXPIRED', HttpStatus.BAD_REQUEST, 'QR code expired — ask the member to refresh it');
    return memberId;
  }

  async revokeTokens(actor: AuthUser, memberId: string) {
    await this.prisma.member.update({ where: { id: memberId }, data: { qrVersion: { increment: 1 } } });
    await this.audit.log(actor, { action: 'member.qr_revoked', entityType: 'Member', entityId: memberId });
  }

  private async memberSummary(tx: Tx, memberId: string) {
    return tx.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        memberNumber: true,
        homeBranchId: true,
        user: { select: { status: true, profile: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
      },
    });
  }

  /** Validates and records a gym visit. Rejections are recorded too, so reception has a full trail. */
  async checkIn(actor: AuthUser, input: { qrToken?: string; memberId?: string; branchId: string }) {
    assertBranchAccess(actor, input.branchId);
    const branch = await this.prisma.branch.findUnique({ where: { id: input.branchId } });
    if (!branch || !branch.isActive) throw notFound('Branch');
    const method: CheckInMethod = input.qrToken ? 'QR' : 'SEARCH';
    const memberId = input.qrToken ? await this.verifyToken(input.qrToken) : input.memberId!;
    const now = new Date();
    const localDate = keyToDbDate(todayKey(now));

    const result = await this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${memberId} FOR UPDATE`;
      const member = await this.memberSummary(tx, memberId);
      if (!member) throw notFound('Member');
      const existing = await tx.checkIn.findFirst({
        where: { memberId, branchId: input.branchId, localDate, status: 'ACCEPTED' },
      });
      if (existing) {
        throw conflict('ALREADY_CHECKED_IN', 'Already checked in today', { at: existing.createdAt.toISOString() });
      }

      const memberships = await tx.membership.findMany({
        where: { memberId, status: { in: ['ACTIVE', 'FROZEN', 'PENDING', 'EXPIRED'] } },
        orderBy: { endsAt: 'desc' },
      });
      let reason: EligibilityReason = 'NO_MEMBERSHIP';
      let chosen: (typeof memberships)[number] | null = null;
      for (const m of memberships) {
        const r = checkMembershipEligibility(m, { at: now, branchId: input.branchId, purpose: 'visit' });
        if (r.eligible) {
          chosen = m;
          break;
        }
        if (reason === 'NO_MEMBERSHIP') reason = r.reason;
      }
      if (member.user.status !== 'ACTIVE') {
        chosen = null;
        reason = 'CANCELLED';
      }

      if (!chosen) {
        const rejectedRow = await tx.checkIn.create({
          data: {
            memberId,
            branchId: input.branchId,
            staffId: actor.id,
            method,
            status: 'REJECTED',
            rejectReason: reason,
            localDate,
            membershipId: memberships[0]?.id,
          },
        });
        return { accepted: false as const, reason, checkIn: rejectedRow, member, membership: memberships[0] ?? null };
      }

      const counted = await tx.membership.updateMany({
        where: {
          id: chosen.id,
          status: 'ACTIVE',
          ...(chosen.visitLimit !== null ? { visitsUsed: { lt: chosen.visitLimit } } : {}),
        },
        data: { visitsUsed: { increment: 1 } },
      });
      if (counted.count !== 1) {
        const rejectedRow = await tx.checkIn.create({
          data: {
            memberId,
            branchId: input.branchId,
            staffId: actor.id,
            method,
            status: 'REJECTED',
            rejectReason: 'VISIT_LIMIT_REACHED',
            localDate,
            membershipId: chosen.id,
          },
        });
        return {
          accepted: false as const,
          reason: 'VISIT_LIMIT_REACHED' as EligibilityReason,
          checkIn: rejectedRow,
          member,
          membership: chosen,
        };
      }
      const checkIn = await tx.checkIn.create({
        data: {
          memberId,
          branchId: input.branchId,
          staffId: actor.id,
          method,
          status: 'ACCEPTED',
          localDate,
          membershipId: chosen.id,
        },
      });
      await tx.membershipEvent.create({
        data: {
          membershipId: chosen.id,
          type: 'VISIT',
          actorId: actor.id,
          data: { branchId: input.branchId, checkInId: checkIn.id },
        },
      });
      const membership = await tx.membership.findUniqueOrThrow({ where: { id: chosen.id } });
      return { accepted: true as const, reason: null, checkIn, member, membership };
    });

    return this.present(result);
  }

  /** Accepts a visit despite failed validation. Requires checkin.override and a reason; always audited. */
  async override(actor: AuthUser, input: { memberId: string; branchId: string; reason: string }) {
    assertBranchAccess(actor, input.branchId);
    const localDate = keyToDbDate(todayKey());
    const result = await this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${input.memberId} FOR UPDATE`;
      const member = await this.memberSummary(tx, input.memberId);
      if (!member) throw notFound('Member');
      const existing = await tx.checkIn.findFirst({
        where: { memberId: input.memberId, branchId: input.branchId, localDate, status: 'ACCEPTED' },
      });
      if (existing)
        throw conflict('ALREADY_CHECKED_IN', 'Already checked in today', { at: existing.createdAt.toISOString() });
      const membership = await tx.membership.findFirst({
        where: { memberId: input.memberId },
        orderBy: { endsAt: 'desc' },
      });
      const checkIn = await tx.checkIn.create({
        data: {
          memberId: input.memberId,
          branchId: input.branchId,
          staffId: actor.id,
          method: 'MANUAL_OVERRIDE',
          status: 'ACCEPTED',
          overrideReason: input.reason,
          localDate,
          membershipId: membership?.id,
        },
      });
      return { accepted: true as const, reason: null, checkIn, member, membership };
    });
    await this.audit.log(actor, {
      action: 'checkin.override',
      entityType: 'CheckIn',
      entityId: result.checkIn.id,
      branchId: input.branchId,
      metadata: { memberId: input.memberId, reason: input.reason },
    });
    return this.present(result);
  }

  private present(r: {
    accepted: boolean;
    reason: string | null;
    checkIn: { id: string; createdAt: Date; method: string };
    member: NonNullable<Awaited<ReturnType<CheckInService['memberSummary']>>>;
    membership: {
      id: string;
      status: string;
      endsAt: Date;
      visitLimit: number | null;
      visitsUsed: number;
      planSnapshot: Prisma.JsonValue;
    } | null;
  }) {
    return {
      accepted: r.accepted,
      reason: r.reason,
      checkIn: { id: r.checkIn.id, at: r.checkIn.createdAt, method: r.checkIn.method },
      member: {
        id: r.member.id,
        memberNumber: r.member.memberNumber,
        firstName: r.member.user.profile?.firstName ?? '',
        lastName: r.member.user.profile?.lastName ?? '',
        avatarUrl: r.member.user.profile?.avatarUrl ?? null,
      },
      membership: r.membership
        ? {
            id: r.membership.id,
            status: r.membership.status,
            endsAt: r.membership.endsAt,
            planName: (r.membership.planSnapshot as { name?: unknown } | null)?.name ?? null,
            remainingVisits: remainingVisits(r.membership),
          }
        : null,
    };
  }

  /** Reception search: minimal data across branches so multi-branch members can be checked in anywhere. */
  async lookup(q: string, branchId: string) {
    const term = q.trim();
    if (term.length < 2) return [];
    const numeric = /^(fc-?)?\d+$/i.test(term) ? Number(term.replace(/\D/g, '')) : null;
    const digits = term.replace(/\D/g, '');
    const members = await this.prisma.member.findMany({
      where: {
        user: { deletedAt: null },
        OR: [
          ...(numeric !== null ? [{ memberNumber: numeric }] : []),
          { user: { email: { contains: term, mode: 'insensitive' as const } } },
          { user: { profile: { firstName: { contains: term, mode: 'insensitive' as const } } } },
          { user: { profile: { lastName: { contains: term, mode: 'insensitive' as const } } } },
          ...(digits.length >= 4 ? [{ user: { profile: { phone: { contains: digits } } } }] : []),
        ],
      },
      take: 10,
      select: {
        id: true,
        memberNumber: true,
        user: { select: { profile: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
        memberships: { where: { status: { in: ['ACTIVE', 'FROZEN', 'PENDING'] } }, orderBy: { endsAt: 'desc' } },
      },
    });
    const now = new Date();
    return members.map((m) => {
      const current = m.memberships[0] ?? null;
      const eligibility =
        m.memberships
          .map((ms) => checkMembershipEligibility(ms, { at: now, branchId, purpose: 'visit' }))
          .find((r) => r.eligible) ?? checkMembershipEligibility(current, { at: now, branchId, purpose: 'visit' });
      return {
        id: m.id,
        memberNumber: m.memberNumber,
        firstName: m.user.profile?.firstName ?? '',
        lastName: m.user.profile?.lastName ?? '',
        avatarUrl: m.user.profile?.avatarUrl ?? null,
        membership: current
          ? {
              status: current.status,
              endsAt: current.endsAt,
              planName: (current.planSnapshot as { name?: unknown }).name,
              remainingVisits: remainingVisits(current),
            }
          : null,
        eligible: eligibility.eligible,
        reason: eligibility.eligible ? null : eligibility.reason,
      };
    });
  }

  async list(
    actor: AuthUser,
    q: {
      page: number;
      pageSize: number;
      branchId?: string;
      date?: string;
      status?: 'ACCEPTED' | 'REJECTED';
      memberId?: string;
    },
  ) {
    const branchId = actor.staffBranchId ?? q.branchId;
    const where: Prisma.CheckInWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(q.date ? { localDate: keyToDbDate(q.date) } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.memberId ? { memberId: q.memberId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.checkIn.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          member: {
            select: {
              id: true,
              memberNumber: true,
              user: { select: { profile: { select: { firstName: true, lastName: true } } } },
            },
          },
          branch: { select: { name: true } },
        },
      }),
      this.prisma.checkIn.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
}
