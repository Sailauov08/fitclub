import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  DEFAULT_NOTIFICATION_PREFS,
  convertLeadSchema,
  leadActivitySchema,
  leadInputSchema,
  leadListQuerySchema,
  leadStatusSchema,
  type PublicLeadInput,
} from '@fitclub/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { badRequest, conflict, notFound } from '../../common/errors';
import { keyToDbDate } from '../../common/dates';
import { assertBranchAccess, type AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../notifications/email.service';

/**
 * Lead visibility: `leads.read_all` sees everything (in branch scope);
 * `leads.read` (sales) sees leads assigned to them plus unassigned ones they can pick up.
 */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
  ) {}

  private scope(actor: AuthUser): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {};
    if (!actor.permissions.includes('leads.read_all')) where.OR = [{ assignedToId: actor.id }, { assignedToId: null }];
    if (actor.staffBranchId) where.AND = [{ OR: [{ branchId: actor.staffBranchId }, { branchId: null }] }];
    return where;
  }

  private async findScoped(actor: AuthUser, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { AND: [{ id }, this.scope(actor)] } });
    if (!lead) throw notFound('Lead');
    return lead;
  }

  /** Website enquiry. Deduplicates open leads by e-mail/phone so repeat submissions add an activity instead. */
  async createPublic(input: PublicLeadInput, ip?: string) {
    if (input.website) return { ok: true }; // honeypot filled → silently drop bots
    if (input.branchId && !(await this.prisma.branch.findFirst({ where: { id: input.branchId, isActive: true } }))) {
      throw badRequest('VALIDATION_FAILED', 'Unknown branch');
    }
    const open = await this.prisma.lead.findFirst({
      where: {
        status: { notIn: ['WON', 'LOST'] },
        OR: [...(input.email ? [{ email: input.email }] : []), ...(input.phone ? [{ phone: input.phone }] : [])],
      },
    });
    const body = [
      input.interest && `Interest: ${input.interest}`,
      input.preferredDate && `Preferred date: ${input.preferredDate}`,
      input.message,
    ]
      .filter(Boolean)
      .join('\n');
    if (open) {
      await this.prisma.leadActivity.create({
        data: { leadId: open.id, type: 'NOTE', body: `Repeat website enquiry (${input.source}).\n${body}`.trim() },
      });
      return { ok: true };
    }
    const lead = await this.prisma.lead.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        source: input.source,
        branchId: input.branchId,
        interest: input.interest,
        message: input.message,
        preferredDate: input.preferredDate ? keyToDbDate(input.preferredDate) : null,
        consentAt: new Date(),
      },
    });
    await this.audit.log(
      null,
      { action: 'lead.website', entityType: 'Lead', entityId: lead.id, branchId: input.branchId },
      { ip },
    );
    await this.notifications.notifyStaff(['OWNER', 'ADMIN', 'MANAGER'], 'ADMIN_ALERT', {
      title: { kk: 'Сайттан жаңа өтінім', ru: 'Новая заявка с сайта', en: 'New website enquiry' },
      body: `${lead.name} — ${input.source === 'TRIAL_REQUEST' ? 'trial' : 'contact'}`,
    });
    return { ok: true };
  }

  async list(actor: AuthUser, q: z.infer<typeof leadListQuerySchema>) {
    const filters: Prisma.LeadWhereInput[] = [this.scope(actor)];
    if (q.status) filters.push({ status: q.status });
    if (q.source) filters.push({ source: q.source });
    if (q.branchId) filters.push({ branchId: q.branchId });
    if (q.assignedToId === 'me') filters.push({ assignedToId: actor.id });
    else if (q.assignedToId === 'none') filters.push({ assignedToId: null });
    else if (q.assignedToId) filters.push({ assignedToId: q.assignedToId });
    if (q.q) {
      filters.push({
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { email: { contains: q.q, mode: 'insensitive' } },
          { phone: { contains: q.q.replace(/\D/g, '') || q.q } },
        ],
      });
    }
    const where = { AND: filters };
    const now = new Date();
    const [items, total, byStatus] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          assignedTo: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          branch: { select: { name: true } },
          activities: { where: { type: 'TASK', completedAt: null }, orderBy: { dueAt: 'asc' }, take: 1 },
        },
      }),
      this.prisma.lead.count({ where }),
      this.prisma.lead.groupBy({ by: ['status'], where: { AND: [this.scope(actor)] }, _count: true }),
    ]);
    return {
      items: items.map((l) => ({
        ...l,
        nextTask: l.activities[0] ?? null,
        overdue: Boolean(l.activities[0]?.dueAt && l.activities[0].dueAt < now),
        activities: undefined,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      pipeline: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    };
  }

  async detail(actor: AuthUser, id: string) {
    await this.findScoped(actor, id);
    return this.prisma.lead.findUniqueOrThrow({
      where: { id },
      include: {
        assignedTo: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        branch: { select: { id: true, name: true } },
        convertedMember: { select: { id: true, memberNumber: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } },
        },
      },
    });
  }

  async create(actor: AuthUser, input: z.infer<typeof leadInputSchema>) {
    if (input.branchId) assertBranchAccess(actor, input.branchId);
    const assignedToId = actor.permissions.includes('leads.assign')
      ? (input.assignedToId ?? null)
      : actor.permissions.includes('leads.manage')
        ? actor.id
        : null;
    const lead = await this.prisma.lead.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        source: input.source,
        branchId: input.branchId ?? actor.staffBranchId,
        interest: input.interest,
        message: input.message,
        assignedToId,
        activities: { create: { type: 'NOTE', body: 'Lead created', actorId: actor.id } },
      },
    });
    await this.audit.log(actor, { action: 'lead.create', entityType: 'Lead', entityId: lead.id });
    return lead;
  }

  async setStatus(actor: AuthUser, id: string, input: z.infer<typeof leadStatusSchema>) {
    const lead = await this.findScoped(actor, id);
    if (lead.convertedAt && input.status !== 'WON')
      throw conflict('LEAD_ALREADY_CONVERTED', 'Converted leads stay won');
    await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id },
        data: {
          status: input.status,
          lostReason: input.status === 'LOST' ? input.lostReason : null,
          assignedToId: lead.assignedToId ?? actor.id,
        },
      }),
      this.prisma.leadActivity.create({
        data: {
          leadId: id,
          type: 'STATUS_CHANGE',
          body: `${lead.status} → ${input.status}${input.lostReason ? `: ${input.lostReason}` : ''}`,
          actorId: actor.id,
        },
      }),
    ]);
    await this.audit.log(actor, {
      action: 'lead.status',
      entityType: 'Lead',
      entityId: id,
      metadata: { from: lead.status, to: input.status },
    });
  }

  async assign(actor: AuthUser, id: string, assignedToId: string | null) {
    const lead = await this.findScoped(actor, id);
    if (assignedToId) {
      const staff = await this.prisma.staffMember.findUnique({ where: { userId: assignedToId } });
      if (!staff || staff.status !== 'ACTIVE' || !['OWNER', 'ADMIN', 'MANAGER', 'SALES'].includes(staff.role)) {
        throw badRequest('VALIDATION_FAILED', 'Leads can be assigned to sales staff or managers only');
      }
    }
    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id }, data: { assignedToId } }),
      this.prisma.leadActivity.create({
        data: { leadId: id, type: 'ASSIGNMENT', body: assignedToId ? `Assigned` : 'Unassigned', actorId: actor.id },
      }),
    ]);
    await this.audit.log(actor, {
      action: 'lead.assign',
      entityType: 'Lead',
      entityId: id,
      metadata: { from: lead.assignedToId, to: assignedToId },
    });
    if (assignedToId && assignedToId !== actor.id)
      await this.notifications.notify(assignedToId, 'LEAD_ASSIGNED', { leadName: lead.name });
  }

  async addActivity(actor: AuthUser, id: string, input: z.infer<typeof leadActivitySchema>) {
    await this.findScoped(actor, id);
    if (input.type === 'TASK' && !input.dueAt)
      throw badRequest('VALIDATION_FAILED', 'Tasks need a due date', {
        issues: [{ path: 'dueAt', message: 'v.required' }],
      });
    const activity = await this.prisma.leadActivity.create({
      data: {
        leadId: id,
        type: input.type,
        body: input.body,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        actorId: actor.id,
      },
    });
    // Logging a call/e-mail/meeting means the lead has been contacted.
    if (input.type !== 'NOTE' && input.type !== 'TASK') {
      await this.prisma.lead.updateMany({ where: { id, status: 'NEW' }, data: { status: 'CONTACTED' } });
    }
    return activity;
  }

  async completeTask(actor: AuthUser, leadId: string, activityId: string) {
    await this.findScoped(actor, leadId);
    const updated = await this.prisma.leadActivity.updateMany({
      where: { id: activityId, leadId, type: 'TASK', completedAt: null },
      data: { completedAt: new Date() },
    });
    if (updated.count !== 1) throw notFound('Task');
  }

  /** Lead → member account. Membership is then sold through the normal sale flow with `leadId`, which marks the lead WON. */
  async convert(actor: AuthUser, id: string, input: z.infer<typeof convertLeadSchema>) {
    const lead = await this.findScoped(actor, id);
    if (lead.convertedMemberId)
      throw conflict('LEAD_ALREADY_CONVERTED', 'Lead already converted', { memberId: lead.convertedMemberId });
    assertBranchAccess(actor, input.homeBranchId);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { member: true },
    });
    let memberId: string;
    if (existingUser?.member) {
      memberId = existingUser.member.id;
    } else if (existingUser) {
      const m = await this.prisma.member.create({
        data: { userId: existingUser.id, homeBranchId: input.homeBranchId },
      });
      memberId = m.id;
    } else {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
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
      memberId = user.member!.id;
      const token = await this.auth.issueToken('MEMBER_INVITE', user.email, user.id);
      await this.email.send(user.email, 'MEMBER_INVITE', 'ru', {
        link: this.auth.link('/reset-password', token, 'ru'),
      });
    }
    await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id },
        data: { convertedMemberId: memberId, status: lead.status === 'NEW' ? 'NEGOTIATION' : lead.status },
      }),
      this.prisma.leadActivity.create({
        data: { leadId: id, type: 'NOTE', body: 'Member account created', actorId: actor.id },
      }),
    ]);
    await this.audit.log(actor, { action: 'lead.convert', entityType: 'Lead', entityId: id, metadata: { memberId } });
    return { memberId };
  }

  async assignableStaff() {
    return this.prisma.staffMember.findMany({
      where: { status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN', 'MANAGER', 'SALES'] } },
      select: {
        userId: true,
        role: true,
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }
}
