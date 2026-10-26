import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Locale, Permission, Role, StaffRole } from '@fitclub/shared';
import { forbidden } from './errors';

export interface AuthUser {
  id: string;
  email: string;
  locale: Locale;
  sessionId: string;
  /** Staff role when the user is active staff; otherwise MEMBER. */
  role: Role;
  staffRole: StaffRole | null;
  /** Branch the staff member is limited to; null = all branches. */
  staffBranchId: string | null;
  memberId: string | null;
  trainerId: string | null;
  permissions: readonly Permission[];
  emailVerified: boolean;
}

export type AuthedRequest = Request & { user?: AuthUser; sessionCsrfHash?: string };

export const IS_PUBLIC = 'fitclub:public';
export const PERMISSIONS_KEY = 'fitclub:permissions';
export const MEMBER_ONLY = 'fitclub:member-only';

/** No session required. Optional sessions are still resolved so handlers can personalise. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Requires every listed permission (`any: true` → at least one). */
export const RequirePermissions = (permissions: Permission[], opts: { any?: boolean } = {}) =>
  SetMetadata(PERMISSIONS_KEY, { permissions, any: Boolean(opts.any) });

/** Requires the caller to have a member record (member portal endpoints). */
export const MemberOnly = () => SetMetadata(MEMBER_ONLY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

export function requireMemberId(user: AuthUser): string {
  if (!user.memberId) throw forbidden('A member account is required');
  return user.memberId;
}

/**
 * Branch scoping: staff limited to one branch only see that branch's data.
 * Returns undefined for club-wide staff (no filter).
 */
export function branchFilter(user: AuthUser): string | undefined {
  return user.staffBranchId ?? undefined;
}

export function assertBranchAccess(user: AuthUser, branchId: string | null | undefined): void {
  if (user.staffBranchId && branchId && user.staffBranchId !== branchId) {
    throw forbidden('This record belongs to another branch');
  }
}

export function clientIp(req: Request): string | undefined {
  return req.ip;
}
