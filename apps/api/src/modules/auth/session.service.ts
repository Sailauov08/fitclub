import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { isLocale, permissionsForRole, type Role } from '@fitclub/shared';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/auth-context';
import { randomToken, sha256 } from '../../common/crypto';
import { SettingsService } from '../settings/settings.service';

export const SESSION_COOKIE = 'fc_session';
export const CSRF_COOKIE = 'fc_csrf';
const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * Opaque server-side sessions. The browser holds a random token in an HttpOnly cookie;
 * the database stores only its SHA-256 hash, so a database leak does not leak sessions.
 * A second, readable cookie carries the CSRF token (double-submit), whose hash is bound to the session.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private cookieBase(): CookieOptions {
    return { secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/' };
  }

  async create(userId: string, meta: { ip?: string; userAgent?: string }, res: Response) {
    const token = randomToken(32);
    const csrf = randomToken(24);
    const { security } = await this.settings.get();
    const ttlMs = security.sessionTtlDays * 86_400_000;
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        csrfHash: sha256(csrf),
        expiresAt: new Date(Date.now() + ttlMs),
        ip: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 256),
      },
    });
    res.cookie(SESSION_COOKIE, token, { ...this.cookieBase(), httpOnly: true, maxAge: ttlMs });
    res.cookie(CSRF_COOKIE, csrf, { ...this.cookieBase(), httpOnly: false, maxAge: ttlMs });
    return session;
  }

  clearCookies(res: Response) {
    res.clearCookie(SESSION_COOKIE, this.cookieBase());
    res.clearCookie(CSRF_COOKIE, this.cookieBase());
  }

  async revoke(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  /** Resolves a raw cookie token to the authenticated user, or null if invalid/expired/suspended. */
  async resolve(token: string | undefined): Promise<{ user: AuthUser; csrfHash: string } | null> {
    if (!token || token.length > 128) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        user: {
          include: {
            staff: true,
            member: { select: { id: true } },
            trainer: { select: { id: true } },
          },
        },
      },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;
    const { user } = session;
    if (user.status !== 'ACTIVE' || user.deletedAt) return null;

    if (now - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session
        .update({ where: { id: session.id }, data: { lastUsedAt: new Date(now) } })
        .catch(() => undefined);
    }

    const activeStaff = user.staff && user.staff.status === 'ACTIVE' ? user.staff : null;
    const role: Role = activeStaff ? activeStaff.role : 'MEMBER';
    return {
      csrfHash: session.csrfHash,
      user: {
        id: user.id,
        email: user.email,
        locale: isLocale(user.locale) ? user.locale : 'ru',
        sessionId: session.id,
        role,
        staffRole: activeStaff?.role ?? null,
        staffBranchId: activeStaff?.branchId ?? null,
        memberId: user.member?.id ?? null,
        trainerId: user.trainer?.id ?? null,
        permissions: permissionsForRole(role),
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    };
  }
}
