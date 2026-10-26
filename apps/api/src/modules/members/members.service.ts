import { Injectable } from '@nestjs/common';
import { DEFAULT_NOTIFICATION_PREFS, remainingVisits, type Locale } from '@fitclub/shared';
import { z } from 'zod';
import { createMemberSchema, updateMemberSchema, paginationSchema } from '@fitclub/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { conflict, forbidden, notFound } from '../../common/errors';
import { assertBranchAccess, type AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../notifications/email.service';

export const memberListQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'FROZEN', 'PENDING', 'EXPIRED', 'NONE']).optional(),
  branchId: z.string().max(64).optional(),
  planId: z.string().max(64).optional(),
  trainerId: z.string().max(64).optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(90).optional(),
  sort: z.enum(['newest', 'name', 'expiry']).default('newest'),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

const listSelect = {
  id: true,
  memberNumber: true,
  createdAt: true,
  isDemo: true,
  homeBranch: { select: { id: true, name: true } },
  assignedTrainer: { select: { id: true, displayName: true } },
  user: {
    select: {
      id: true,
      email: true,
      status: true,
      profile: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } },
    },
  },
  memberships: {
    where: { status: { in: ['ACTIVE', 'FROZEN', 'PENDING'] } },
    orderBy: { endsAt: 'desc' },
    take: 1,
    select: { id: true, status: true, endsAt: true, visitLimit: true, visitsUsed: true, planSnapshot: true },
  },
} satisfies Prisma.MemberSelect;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
  ) {}

  /**
   * Object-level access: branch-scoped staff see only their branch; trainers holding only
   * `members.read_assigned` see members assigned to them or booked into their classes.
   */
  scopeWhere(actor: AuthUser): Prisma.MemberWhereInput {
    const where: Prisma.MemberWhereInput = { user: { deletedAt: null } };
    if (!actor.permissions.includes('members.read')) {
      if (!actor.permissions.includes('members.read_assigned') || !actor.trainerId) return { id: '__none__' };
      where.OR = [
        { assignedTrainerId: actor.trainerId },
        { bookings: { some: { session: { trainerId: actor.trainerId } } } },
      ];
    }
    if (actor.staffBranchId) where.homeBranchId = actor.staffBranchId;
    return where;
  }

  private filters(q: MemberListQuery): Prisma.MemberWhereInput[] {
    const and: Prisma.MemberWhereInput[] = [];
    if (q.q) {
      const term = q.q.trim();
      const numeric = /^(fc-?)?\d+$/i.test(term) ? Number(term.replace(/\D/g, '')) : null;
      and.push({
        OR: [
          ...(numeric !== null ? [{ memberNumber: numeric }] : []),
          { user: { email: { contains: term, mode: 'insensitive' } } },
          { user: { profile: { firstName: { contains: term, mode: 'insensitive' } } } },
          { user: { profile: { lastName: { contains: term, mode: 'insensitive' } } } },
          { user: { profile: { phone: { contains: term.replace(/\D/g, '') || term } } } },
        ],
      });
    }
    if (q.branchId) and.push({ homeBranchId: q.branchId });
    if (q.trainerId) and.push({ assignedTrainerId: q.trainerId });
    if (q.status === 'NONE') and.push({ memberships: { none: { status: { in: ['ACTIVE', 'FROZEN', 'PENDING'] } } } });
    else if (q.status)
      and.push({ memberships: { some: { status: q.status, ...(q.planId ? { planId: q.planId } : {}) } } });
    else if (q.planId) and.push({ memberships: { some: { planId: q.planId, status: { in: ['ACTIVE', 'FROZEN'] } } } });
    if (q.expiringWithinDays) {
      const until = new Date(Date.now() + q.expiringWithinDays * 86_400_000);
      and.push({ memberships: { some: { status: 'ACTIVE', endsAt: { gte: new Date(), lte: until } } } });
    }
    return and;
  }

  async list(actor: AuthUser, q: MemberListQuery) {
    const where: Prisma.MemberWhereInput = { AND: [this.scopeWhere(actor), ...this.filters(q)] };
    const orderBy: Prisma.MemberOrderByWithRelationInput[] =
      q.sort === 'name' ? [{ user: { profile: { lastName: 'asc' } } }] : [{ createdAt: 'desc' }];
    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        select: listSelect,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.member.count({ where }),
    ]);
    return {
      items: items.map((m) => ({
        ...m,
        currentMembership: m.memberships[0]
          ? { ...m.memberships[0], remainingVisits: remainingVisits(m.memberships[0]) }
          : null,
        memberships: undefined,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async exportCsv(actor: AuthUser, q: MemberListQuery) {
    const where: Prisma.MemberWhereInput = { AND: [this.scopeWhere(actor), ...this.filters(q)] };
    const rows = await this.prisma.member.findMany({
      where,
      select: listSelect,
      orderBy: { memberNumber: 'asc' },
      take: 10_000,
    });
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      // Prefix formula-like values to prevent CSV injection in spreadsheet apps.
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const header = [
      'member_number',
      'first_name',
      'last_name',
      'email',
      'phone',
      'branch',
      'membership_status',
      'membership_plan',
      'membership_ends',
      'joined',
    ];
    const lines = rows.map((m) => {
      const ms = m.memberships[0];
      const branchName = (m.homeBranch.name as { ru?: string })?.ru ?? '';
      const planName = (ms?.planSnapshot as { name?: { ru?: string } } | undefined)?.name?.ru ?? '';
      return [
        `FC-${String(m.memberNumber).padStart(6, '0')}`,
        m.user.profile?.firstName,
        m.user.profile?.lastName,
        m.user.email,
        m.user.profile?.phone,
        branchName,
        ms?.status ?? 'NONE',
        planName,
        ms?.endsAt.toISOString().slice(0, 10) ?? '',
        m.createdAt.toISOString().slice(0, 10),
      ]
        .map(esc)
        .join(',');
    });
    await this.audit.log(actor, {
      action: 'members.export',
      entityType: 'Member',
      metadata: { rows: rows.length, filters: q },
    });
    return `\uFEFF${header.join(',')}\n${lines.join('\n')}\n`;
  }

  async detail(actor: AuthUser, id: string) {
    const member = await this.prisma.member.findFirst({
      where: { AND: [{ id }, this.scopeWhere(actor)] },
      include: {
        homeBranch: { select: { id: true, name: true } },
        assignedTrainer: { select: { id: true, displayName: true, slug: true } },
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            locale: true,
            emailVerifiedAt: true,
            createdAt: true,
            lastLoginAt: true,
            profile: true,
          },
        },
        memberships: {
          orderBy: { createdAt: 'desc' },
          include: {
            freezes: { orderBy: { startDate: 'desc' } },
            events: { orderBy: { createdAt: 'desc' }, take: 40 },
          },
        },
        notes: actor.permissions.includes('members.notes')
          ? {
              orderBy: { createdAt: 'desc' },
              include: {
                author: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
              },
            }
          : false,
        assignments: {
          include: { program: { select: { id: true, name: true } }, trainer: { select: { displayName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!member) throw notFound('Member');
    const canSeePayments = actor.permissions.includes('payments.read') || actor.permissions.includes('payments.record');
    const [bookings, checkIns, payments] = await Promise.all([
      this.prisma.booking.findMany({
        where: { memberId: id },
        orderBy: { session: { startsAt: 'desc' } },
        take: 50,
        include: {
          session: {
            select: {
              id: true,
              startsAt: true,
              status: true,
              classType: { select: { name: true } },
              trainer: { select: { displayName: true } },
            },
          },
        },
      }),
      this.prisma.checkIn.findMany({
        where: { memberId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { branch: { select: { name: true } } },
      }),
      canSeePayments
        ? this.prisma.payment.findMany({
            where: { memberId: id },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              amount: true,
              status: true,
              method: true,
              purpose: true,
              isTest: true,
              paidAt: true,
              createdAt: true,
              invoice: { select: { id: true, number: true } },
            },
          })
        : Promise.resolve(null),
    ]);
    const { notificationPrefs: _prefs, ...profile } = member.user.profile ?? ({} as Record<string, unknown>);
    return { ...member, user: { ...member.user, profile }, bookings, checkIns, payments };
  }

  /** Reception sign-up. The member receives an invitation link to set their own password. */
  async create(actor: AuthUser, input: z.infer<typeof createMemberSchema>) {
    assertBranchAccess(actor, input.homeBranchId);
    if (await this.prisma.user.findUnique({ where: { email: input.email } }))
      throw conflict('EMAIL_TAKEN', 'An account with this e-mail already exists');
    const branch = await this.prisma.branch.findUnique({ where: { id: input.homeBranchId } });
    if (!branch) throw notFound('Branch');
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        locale: input.locale,
        profile: {
          create: {
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
          },
        },
        member: { create: { homeBranchId: input.homeBranchId } },
      },
      include: { member: true },
    });
    if (input.sendInvite) {
      const token = await this.auth.issueToken('MEMBER_INVITE', user.email, user.id);
      await this.email.send(user.email, 'MEMBER_INVITE', input.locale as Locale, {
        link: this.auth.link('/reset-password', token, input.locale as Locale),
      });
    }
    await this.audit.log(actor, {
      action: 'member.create',
      entityType: 'Member',
      entityId: user.member!.id,
      branchId: input.homeBranchId,
    });
    return user.member!;
  }

  async update(actor: AuthUser, id: string, input: z.infer<typeof updateMemberSchema>) {
    const member = await this.prisma.member.findFirst({ where: { AND: [{ id }, this.scopeWhere(actor)] } });
    if (!member) throw notFound('Member');
    assertBranchAccess(actor, input.homeBranchId);
    if (input.assignedTrainerId) {
      const trainer = await this.prisma.trainer.findUnique({ where: { id: input.assignedTrainerId } });
      if (!trainer || !trainer.isActive) throw notFound('Trainer');
    }
    await this.prisma.member.update({
      where: { id },
      data: {
        homeBranch: { connect: { id: input.homeBranchId } },
        ...(input.assignedTrainerId !== undefined
          ? {
              assignedTrainer: input.assignedTrainerId
                ? { connect: { id: input.assignedTrainerId } }
                : { disconnect: true },
            }
          : {}),
        user: {
          update: {
            profile: {
              update: {
                firstName: input.firstName,
                lastName: input.lastName,
                ...(input.phone ? { phone: input.phone } : {}),
              },
            },
          },
        },
      },
    });
    await this.audit.log(actor, {
      action: 'member.update',
      entityType: 'Member',
      entityId: id,
      metadata: { homeBranchId: input.homeBranchId, assignedTrainerId: input.assignedTrainerId },
    });
    return { ok: true };
  }

  async setAccountStatus(actor: AuthUser, id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) {
    const member = await this.prisma.member.findFirst({
      where: { AND: [{ id }, this.scopeWhere(actor)] },
      include: { user: { include: { staff: true } } },
    });
    if (!member) throw notFound('Member');
    if (member.user.staff) throw forbidden('Staff accounts are managed in Employees');
    await this.prisma.user.update({ where: { id: member.userId }, data: { status } });
    if (status === 'SUSPENDED')
      await this.prisma.session.updateMany({
        where: { userId: member.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    await this.audit.log(actor, {
      action: status === 'SUSPENDED' ? 'member.suspend' : 'member.reactivate',
      entityType: 'Member',
      entityId: id,
      metadata: { reason },
    });
  }

  async addNote(actor: AuthUser, id: string, body: string) {
    const member = await this.prisma.member.findFirst({ where: { AND: [{ id }, this.scopeWhere(actor)] } });
    if (!member) throw notFound('Member');
    const note = await this.prisma.memberNote.create({ data: { memberId: id, authorId: actor.id, body } });
    await this.audit.log(actor, { action: 'member.note', entityType: 'Member', entityId: id });
    return note;
  }
}
