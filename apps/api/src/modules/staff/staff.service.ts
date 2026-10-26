import { HttpStatus, Injectable } from '@nestjs/common';
import { canChangeStaffRole, DEFAULT_NOTIFICATION_PREFS, type StaffRole } from '@fitclub/shared';
import { z } from 'zod';
import { inviteStaffSchema, updateStaffSchema } from '@fitclub/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError, conflict, notFound } from '../../common/errors';
import type { AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../notifications/email.service';

function denied(reason: string) {
  const messages: Record<string, string> = {
    SELF_CHANGE: 'You cannot change your own role or status',
    NO_PERMISSION: 'You cannot manage staff',
    RANK: 'You can only manage roles below your own',
  };
  return new AppError('ROLE_CHANGE_FORBIDDEN', HttpStatus.FORBIDDEN, messages[reason] ?? 'Not allowed', { reason });
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
  ) {}

  list() {
    return this.prisma.staffMember.findMany({
      include: {
        branch: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            email: true,
            lastLoginAt: true,
            passwordHash: false,
            profile: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } },
            trainer: { select: { id: true, slug: true } },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async activity(userId: string) {
    return this.prisma.auditLog.findMany({ where: { actorId: userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  private async assertNotLastOwner(userId: string) {
    const target = await this.prisma.staffMember.findUnique({ where: { userId } });
    if (target?.role !== 'OWNER') return;
    const owners = await this.prisma.staffMember.count({ where: { role: 'OWNER', status: 'ACTIVE' } });
    if (owners <= 1) throw conflict('LAST_OWNER', 'The club must keep at least one active owner');
  }

  /** Invites staff by e-mail. The invitee sets their own password via a single-use 72-hour link. */
  async invite(actor: AuthUser, input: z.infer<typeof inviteStaffSchema>) {
    const decision = canChangeStaffRole({
      actorId: actor.id,
      actorRole: actor.role,
      targetId: '__new__',
      targetRole: null,
      nextRole: input.role,
    });
    if (!decision.allowed) throw denied(decision.reason);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email }, include: { staff: true } });
    if (existing?.staff) throw conflict('EMAIL_TAKEN', 'This person is already a staff member');
    if (input.branchId && !(await this.prisma.branch.findUnique({ where: { id: input.branchId } })))
      throw notFound('Branch');

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            staff: {
              create: { role: input.role, branchId: input.branchId, title: input.title, invitedById: actor.id },
            },
          },
        })
      : await this.prisma.user.create({
          data: {
            email: input.email,
            profile: {
              create: {
                firstName: input.firstName,
                lastName: input.lastName,
                notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
              },
            },
            staff: {
              create: { role: input.role, branchId: input.branchId, title: input.title, invitedById: actor.id },
            },
          },
        });
    if (!existing?.passwordHash) {
      const token = await this.auth.issueToken('STAFF_INVITE', user.email, user.id, { role: input.role });
      await this.email.send(user.email, 'STAFF_INVITE', 'ru', {
        role: input.role,
        link: this.auth.link('/reset-password', token, 'ru'),
      });
    }
    await this.audit.log(actor, {
      action: 'staff.invite',
      entityType: 'User',
      entityId: user.id,
      metadata: { role: input.role, branchId: input.branchId },
    });
    return { id: user.id };
  }

  async update(actor: AuthUser, userId: string, input: z.infer<typeof updateStaffSchema>) {
    const target = await this.prisma.staffMember.findUnique({ where: { userId } });
    if (!target) throw notFound('Staff member');
    const decision = canChangeStaffRole({
      actorId: actor.id,
      actorRole: actor.role,
      targetId: userId,
      targetRole: target.role,
      nextRole: input.role,
    });
    if (!decision.allowed) throw denied(decision.reason);
    if (target.role === 'OWNER' && input.role !== 'OWNER') await this.assertNotLastOwner(userId);
    const updated = await this.prisma.staffMember.update({
      where: { userId },
      data: { role: input.role as StaffRole, branchId: input.branchId, title: input.title ?? target.title },
    });
    if (target.role !== input.role) {
      // Role changes take effect immediately: existing sessions must re-authenticate.
      await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.log(actor, {
      action: 'staff.role_change',
      entityType: 'User',
      entityId: userId,
      metadata: { from: target.role, to: input.role, branchId: input.branchId },
    });
    return updated;
  }

  async setStatus(actor: AuthUser, userId: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) {
    const target = await this.prisma.staffMember.findUnique({ where: { userId } });
    if (!target) throw notFound('Staff member');
    const decision = canChangeStaffRole({
      actorId: actor.id,
      actorRole: actor.role,
      targetId: userId,
      targetRole: target.role,
      nextRole: target.role,
    });
    if (!decision.allowed) throw denied(decision.reason);
    if (status === 'SUSPENDED') await this.assertNotLastOwner(userId);
    await this.prisma.staffMember.update({ where: { userId }, data: { status } });
    if (status === 'SUSPENDED')
      await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log(actor, {
      action: status === 'SUSPENDED' ? 'staff.suspend' : 'staff.reactivate',
      entityType: 'User',
      entityId: userId,
      metadata: { reason },
    });
  }

  async resendInvite(actor: AuthUser, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { staff: true } });
    if (!user?.staff) throw notFound('Staff member');
    if (user.passwordHash) throw conflict('CONFLICT', 'This account is already activated');
    const token = await this.auth.issueToken('STAFF_INVITE', user.email, user.id, { role: user.staff.role });
    await this.email.send(user.email, 'STAFF_INVITE', 'ru', {
      role: user.staff.role,
      link: this.auth.link('/reset-password', token, 'ru'),
    });
    await this.audit.log(actor, { action: 'staff.invite_resend', entityType: 'User', entityId: userId });
  }
}
