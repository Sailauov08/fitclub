import { Controller, Get, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { clubSettingsSchema, paginationSchema } from '@fitclub/shared';
import { CurrentUser, Public, RequirePermissions, type AuthUser } from '../../common/auth-context';
import { ZBody, ZQuery } from '../../common/zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../notifications/email.service';
import { PaymentsService } from '../payments/payments.service';
import { SettingsService } from './settings.service';
import { Prisma } from '../../generated/prisma/client';

@ApiTags('settings')
@Controller()
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Non-sensitive settings the public site needs (contact, branding, booking rules). */
  @Public()
  @Get('settings/public')
  async publicSettings() {
    const s = await this.settings.get();
    return {
      name: s.name,
      tagline: s.tagline,
      contact: s.contact,
      branding: s.branding,
      bookingPolicy: s.bookingPolicy,
      membershipPolicy: {
        memberSelfFreeze: s.membershipPolicy.memberSelfFreeze,
        minFreezeDays: s.membershipPolicy.minFreezeDays,
      },
    };
  }

  @RequirePermissions(['settings.manage'])
  @Get('admin/settings')
  async get() {
    return {
      settings: await this.settings.get(),
      integrations: { email: this.email.status, payments: this.payments.providerStatus },
    };
  }

  @RequirePermissions(['settings.manage'])
  @Put('admin/settings')
  async update(@CurrentUser() user: AuthUser, @ZBody(clubSettingsSchema) body: z.infer<typeof clubSettingsSchema>) {
    const before = await this.settings.get();
    const next = await this.settings.update(body);
    const changed = (Object.keys(body) as (keyof typeof body)[]).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(body[k]),
    );
    await this.audit.log(user, { action: 'settings.update', entityType: 'Club', metadata: { changed } });
    return next;
  }

  @RequirePermissions(['settings.manage'])
  @Get('admin/emails')
  async emails(@ZQuery(paginationSchema) q: z.infer<typeof paginationSchema>) {
    const [items, total, byStatus] = await Promise.all([
      this.prisma.emailMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          to: true,
          subject: true,
          type: true,
          status: true,
          error: true,
          createdAt: true,
          sentAt: true,
        },
      }),
      this.prisma.emailMessage.count(),
      this.prisma.emailMessage.groupBy({ by: ['status'], _count: true }),
    ]);
    return {
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      delivery: this.email.status,
    };
  }
}

const auditQuerySchema = paginationSchema.extend({
  action: z.string().max(80).optional(),
  entityType: z.string().max(80).optional(),
  actorId: z.string().max(64).optional(),
});

@ApiTags('admin/audit')
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions(['audit.read'])
  @Get()
  async list(@ZQuery(auditQuerySchema) q: z.infer<typeof auditQuerySchema>, @Query('entityId') entityId?: string) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(entityId ? { entityId } : {}),
      ...(q.q
        ? {
            OR: [
              { action: { contains: q.q, mode: 'insensitive' } },
              { actor: { email: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          actor: {
            select: {
              email: true,
              profile: { select: { firstName: true, lastName: true } },
              staff: { select: { role: true } },
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
}
