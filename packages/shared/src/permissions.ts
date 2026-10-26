import type { Role, StaffRole } from './enums';

/**
 * Every backend-protected capability. The API enforces these with @RequirePermissions();
 * the web app only uses them to hide navigation — hiding is never treated as security.
 */
export const PERMISSIONS = [
  'dashboard.view',
  'members.read',
  'members.read_assigned',
  'members.write',
  'members.notes',
  'members.export',
  'memberships.read',
  'memberships.sell',
  'memberships.manage',
  'plans.manage',
  'classes.manage',
  'schedule.read',
  'schedule.manage',
  'sessions.cancel',
  'attendance.mark',
  'bookings.manage',
  'trainers.manage',
  'checkin.perform',
  'checkin.override',
  'checkin.read',
  'payments.read',
  'payments.record',
  'payments.refund',
  'payments.reconcile',
  'leads.create',
  'leads.read',
  'leads.read_all',
  'leads.manage',
  'leads.assign',
  'staff.read',
  'staff.manage',
  'branches.manage',
  'promotions.manage',
  'content.manage',
  'analytics.view',
  'analytics.finance',
  'settings.manage',
  'audit.read',
  'training.manage_own',
  'training.manage_all',
  'exercises.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  MANAGER: [
    'dashboard.view',
    'members.read',
    'members.write',
    'members.notes',
    'members.export',
    'memberships.read',
    'memberships.sell',
    'memberships.manage',
    'classes.manage',
    'schedule.read',
    'schedule.manage',
    'sessions.cancel',
    'attendance.mark',
    'bookings.manage',
    'trainers.manage',
    'checkin.perform',
    'checkin.override',
    'checkin.read',
    'payments.read',
    'payments.record',
    'leads.create',
    'leads.read',
    'leads.read_all',
    'leads.manage',
    'leads.assign',
    'staff.read',
    'promotions.manage',
    'content.manage',
    'analytics.view',
    'analytics.finance',
    'training.manage_all',
    'exercises.manage',
  ],
  RECEPTIONIST: [
    'dashboard.view',
    'members.read',
    'members.write',
    'memberships.read',
    'memberships.sell',
    'schedule.read',
    'attendance.mark',
    'bookings.manage',
    'checkin.perform',
    'checkin.read',
    'payments.record',
    'leads.create',
  ],
  TRAINER: [
    'dashboard.view',
    'members.read_assigned',
    'schedule.read',
    'attendance.mark',
    'training.manage_own',
    'exercises.manage',
  ],
  SALES: [
    'dashboard.view',
    'members.read',
    'members.write',
    'memberships.read',
    'memberships.sell',
    'schedule.read',
    'payments.read',
    'payments.record',
    'leads.create',
    'leads.read',
    'leads.manage',
    'analytics.view',
  ],
  MEMBER: [],
};

/** Higher rank may manage lower rank. Equal ranks cannot manage each other (no peer/self promotion). */
export const ROLE_RANK: Record<Role, number> = {
  OWNER: 100,
  ADMIN: 80,
  MANAGER: 60,
  SALES: 40,
  RECEPTIONIST: 40,
  TRAINER: 40,
  MEMBER: 0,
};

export function permissionsForRole(role: Role | null | undefined): readonly Permission[] {
  return role ? ROLE_PERMISSIONS[role] : [];
}

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function hasAnyPermission(role: Role | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export type RoleChangeDecision =
  | { allowed: true }
  | { allowed: false; reason: 'SELF_CHANGE' | 'NO_PERMISSION' | 'RANK' };

/**
 * Decides whether `actor` may give `target` the role `nextRole` (or change/suspend them).
 * - nobody changes their own role or status (prevents self-promotion and lock-out),
 * - the actor needs `staff.manage`,
 * - the actor must outrank both the target's current role and the requested role,
 *   except an OWNER, who may appoint another OWNER.
 */
export function canChangeStaffRole(params: {
  actorId: string;
  actorRole: Role;
  targetId: string;
  targetRole: Role | null;
  nextRole: StaffRole | null;
}): RoleChangeDecision {
  const { actorId, actorRole, targetId, targetRole, nextRole } = params;
  if (actorId === targetId) return { allowed: false, reason: 'SELF_CHANGE' };
  if (!hasPermission(actorRole, 'staff.manage')) return { allowed: false, reason: 'NO_PERMISSION' };
  const actorRank = ROLE_RANK[actorRole];
  const isOwner = actorRole === 'OWNER';
  const currentRank = targetRole ? ROLE_RANK[targetRole] : 0;
  const nextRank = nextRole ? ROLE_RANK[nextRole] : 0;
  const outranksCurrent = isOwner ? true : actorRank > currentRank;
  const outranksNext = isOwner ? true : actorRank > nextRank;
  if (!outranksCurrent || !outranksNext) return { allowed: false, reason: 'RANK' };
  return { allowed: true };
}
