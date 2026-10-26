import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@fitclub/shared';
import { env } from '../config/env';
import { CSRF_COOKIE, SESSION_COOKIE, SessionService } from '../modules/auth/session.service';
import { AppError, forbidden } from './errors';
import { IS_PUBLIC, MEMBER_ONLY, PERMISSIONS_KEY, type AuthedRequest } from './auth-context';
import { safeEqual, sha256 } from './crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Paths authenticated by their own signature instead of cookies (payment provider webhooks). */
const CSRF_EXEMPT = [/^\/api\/payments\/webhooks\//];

/**
 * Global guard, in order:
 * 1. Origin check for state-changing requests (blocks cross-site form posts, including login CSRF).
 * 2. Session resolution from the HttpOnly cookie.
 * 3. Double-submit CSRF token for authenticated state-changing requests.
 * 4. @Public / @MemberOnly / @RequirePermissions enforcement.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const handler = context.getHandler();
    const cls = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [handler, cls]);
    const unsafe = !SAFE_METHODS.has(req.method);
    const exempt = CSRF_EXEMPT.some((r) => r.test(req.path));

    if (unsafe && !exempt) {
      const origin = req.headers.origin;
      if (origin && origin !== env.WEB_ORIGIN && origin !== `http://localhost:${env.PORT}`) {
        throw new AppError('CSRF_INVALID', HttpStatus.FORBIDDEN, 'Cross-origin request rejected');
      }
    }

    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const resolved = await this.sessions.resolve(token);
    if (resolved) {
      req.user = resolved.user;
      req.sessionCsrfHash = resolved.csrfHash;
    }

    if (resolved && unsafe && !exempt) {
      const header = req.headers['x-csrf-token'];
      const cookie = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
      const value = typeof header === 'string' ? header : '';
      if (!value || !cookie || !safeEqual(value, cookie) || !safeEqual(sha256(value), resolved.csrfHash)) {
        throw new AppError('CSRF_INVALID', HttpStatus.FORBIDDEN, 'Missing or invalid CSRF token');
      }
    }

    if (isPublic) return true;
    if (!req.user) throw new AppError('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Please sign in');

    if (this.reflector.getAllAndOverride<boolean>(MEMBER_ONLY, [handler, cls]) && !req.user.memberId) {
      throw forbidden('A member account is required');
    }

    const required = this.reflector.getAllAndOverride<{ permissions: Permission[]; any: boolean }>(PERMISSIONS_KEY, [
      handler,
      cls,
    ]);
    if (required && required.permissions.length > 0) {
      const granted = req.user.permissions;
      const ok = required.any
        ? required.permissions.some((p) => granted.includes(p))
        : required.permissions.every((p) => granted.includes(p));
      if (!ok) throw forbidden();
    }
    return true;
  }
}
