import { HttpStatus, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { DEFAULT_NOTIFICATION_PREFS, type Locale, type RegisterInput } from '@fitclub/shared';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError, badRequest, conflict } from '../../common/errors';
import { randomToken, sha256 } from '../../common/crypto';
import type { AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../notifications/email.service';
import { SettingsService } from '../settings/settings.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { AuthTokenType } from '../../generated/prisma/client';

const HOUR = 3_600_000;
export const TOKEN_TTL: Record<AuthTokenType, number> = {
  PASSWORD_RESET: HOUR,
  EMAIL_VERIFY: 48 * HOUR,
  STAFF_INVITE: 72 * HOUR,
  MEMBER_INVITE: 7 * 24 * HOUR,
};

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /** Issues a single-use token; only its hash is stored. Older unused tokens of the same type are invalidated. */
  async issueToken(type: AuthTokenType, email: string, userId: string | null, payload?: Record<string, unknown>) {
    const token = randomToken(32);
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({ where: { email, type, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.authToken.create({
        data: {
          type,
          email,
          userId,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL[type]),
          payload: payload as never,
        },
      }),
    ]);
    return token;
  }

  link(path: string, token: string, locale: Locale) {
    return `${env.PUBLIC_WEB_URL}/${locale}${path}?token=${encodeURIComponent(token)}`;
  }

  async register(input: RegisterInput, meta: RequestMeta, res: Response) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict('EMAIL_TAKEN', 'An account with this e-mail already exists');

    const branch = input.homeBranchId
      ? await this.prisma.branch.findFirst({ where: { id: input.homeBranchId, isActive: true } })
      : await this.prisma.branch.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    if (!branch) throw badRequest('VALIDATION_FAILED', 'No active club branch is configured');

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        locale: input.locale,
        profile: {
          create: {
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            notificationPrefs: {
              ...DEFAULT_NOTIFICATION_PREFS,
              marketing: { inApp: input.marketingOptIn, email: input.marketingOptIn },
            },
            marketingOptIn: input.marketingOptIn,
            termsAcceptedAt: new Date(),
          },
        },
        member: { create: { homeBranchId: branch.id } },
      },
    });
    await this.audit.log(
      { id: user.id },
      { action: 'auth.register', entityType: 'User', entityId: user.id },
      { ip: meta.ip },
    );
    await this.sendVerification(user.id, user.email, input.locale);
    await this.sessions.create(user.id, meta, res);
    return { id: user.id };
  }

  async sendVerification(userId: string, email: string, locale: Locale) {
    const token = await this.issueToken('EMAIL_VERIFY', email, userId);
    await this.email.send(email, 'EMAIL_VERIFY', locale, { link: this.link('/verify-email', token, locale) });
  }

  async login(email: string, password: string, meta: RequestMeta, res: Response) {
    const { security } = await this.settings.get();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const now = new Date();

    if (user?.lockedUntil && user.lockedUntil > now) {
      throw new AppError('ACCOUNT_LOCKED', HttpStatus.TOO_MANY_REQUESTS, 'Too many failed attempts. Try again later.', {
        retryAfterSeconds: Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000),
      });
    }

    const valid = await this.passwords.verify(user?.passwordHash, password);
    if (!user || !valid || user.deletedAt) {
      if (user) {
        const failed = user.failedLoginCount + 1;
        const lock = failed >= security.maxFailedLogins;
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: lock ? 0 : failed,
            lockedUntil: lock ? new Date(now.getTime() + security.lockoutMinutes * 60_000) : null,
          },
        });
        if (lock) {
          await this.audit.log(
            { id: user.id },
            { action: 'auth.lockout', entityType: 'User', entityId: user.id },
            { ip: meta.ip },
          );
        }
      }
      throw new AppError('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED, 'Invalid e-mail or password');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppError('ACCOUNT_SUSPENDED', HttpStatus.FORBIDDEN, 'This account is suspended');
    }
    const staff = await this.prisma.staffMember.findUnique({ where: { userId: user.id } });
    if (staff?.status === 'SUSPENDED') {
      // Suspended staff keep no access; they may still hold a member record but staff login is blocked.
      throw new AppError('ACCOUNT_SUSPENDED', HttpStatus.FORBIDDEN, 'This account is suspended');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await this.sessions.create(user.id, meta, res);
    if (staff) {
      await this.audit.log(
        { id: user.id },
        { action: 'auth.staff_login', entityType: 'User', entityId: user.id },
        { ip: meta.ip },
      );
    }
    return { id: user.id };
  }

  async logout(user: AuthUser | undefined, res: Response) {
    if (user) await this.sessions.revoke(user.sessionId);
    this.sessions.clearCookies(res);
  }

  /** Always succeeds from the caller's perspective so accounts cannot be enumerated. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') return;
    const token = await this.issueToken('PASSWORD_RESET', email, user.id);
    const locale = (user.locale as Locale) ?? 'ru';
    await this.email.send(email, 'PASSWORD_RESET', locale, { link: this.link('/reset-password', token, locale) });
  }

  private async findUsableToken(token: string, types: AuthTokenType[]) {
    const record = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || !types.includes(record.type) || record.usedAt || record.expiresAt <= new Date()) {
      throw badRequest('TOKEN_INVALID', 'This link is invalid or has expired');
    }
    return record;
  }

  async tokenInfo(token: string) {
    const record = await this.findUsableToken(token, ['PASSWORD_RESET', 'MEMBER_INVITE', 'STAFF_INVITE']);
    return { type: record.type, email: record.email, role: (record.payload as { role?: string } | null)?.role ?? null };
  }

  /** Sets a password from a reset or invitation link. Single use; revokes all existing sessions. */
  async resetPassword(token: string, password: string, meta: RequestMeta) {
    const record = await this.findUsableToken(token, ['PASSWORD_RESET', 'MEMBER_INVITE', 'STAFF_INVITE']);
    if (!record.userId) throw badRequest('TOKEN_INVALID', 'This link is invalid or has expired');
    const passwordHash = await this.passwords.hash(password);
    const consumed = await this.prisma.authToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) throw badRequest('TOKEN_INVALID', 'This link is invalid or has expired');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: new Date() },
    });
    await this.sessions.revokeAllForUser(record.userId);
    await this.audit.log(
      { id: record.userId },
      {
        action: record.type === 'PASSWORD_RESET' ? 'auth.password_reset' : 'auth.invite_accepted',
        entityType: 'User',
        entityId: record.userId,
      },
      { ip: meta.ip },
    );
  }

  async verifyEmail(token: string) {
    const record = await this.findUsableToken(token, ['EMAIL_VERIFY']);
    await this.prisma.$transaction([
      this.prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.updateMany({
        where: { id: record.userId ?? '', email: record.email },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
  }

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await this.passwords.verify(record.passwordHash, currentPassword))) {
      throw badRequest('PASSWORD_INCORRECT', 'Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
    await this.sessions.revokeAllForUser(user.id, user.sessionId);
    await this.audit.log(user, { action: 'auth.password_changed', entityType: 'User', entityId: user.id });
  }

  async me(user: AuthUser) {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        profile: true,
        member: { include: { homeBranch: { select: { id: true, name: true, slug: true } } } },
        staff: { include: { branch: { select: { id: true, name: true } } } },
      },
    });
    const { notificationPrefs, ...profile } = record.profile ?? ({} as Record<string, unknown>);
    return {
      id: record.id,
      email: record.email,
      locale: user.locale,
      emailVerified: Boolean(record.emailVerifiedAt),
      role: user.role,
      permissions: user.permissions,
      profile: record.profile ? profile : null,
      notificationPrefs: notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
      member: record.member
        ? { id: record.member.id, memberNumber: record.member.memberNumber, homeBranch: record.member.homeBranch }
        : null,
      staff: record.staff
        ? { role: record.staff.role, title: record.staff.title, branch: record.staff.branch, trainerId: user.trainerId }
        : null,
      isDemo: record.isDemo,
    };
  }

  async listSessions(user: AuthUser) {
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, createdAt: true, lastUsedAt: true, userAgent: true, ip: true },
    });
    return sessions.map((s) => ({ ...s, current: s.id === user.sessionId }));
  }

  async revokeSession(user: AuthUser, sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
