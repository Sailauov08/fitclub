/**
 * String unions mirroring the Prisma enums in apps/api/prisma/schema.prisma.
 * They are duplicated here so the web app can use them without depending on Prisma.
 * `enums.test.ts` in the API keeps both definitions in sync.
 */

export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'TRAINER', 'SALES', 'MEMBER'] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'TRAINER', 'SALES'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['PENDING', 'ACTIVE', 'FROZEN', 'EXPIRED', 'CANCELLED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const PLAN_TYPES = ['MONTHLY', 'ANNUAL', 'CUSTOM', 'TRIAL', 'STUDENT', 'PROMO'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const MEMBERSHIP_EVENT_TYPES = [
  'CREATED',
  'ACTIVATED',
  'FROZEN',
  'UNFROZEN',
  'FREEZE_SCHEDULED',
  'FREEZE_CANCELLED',
  'EXTENDED',
  'RENEWED',
  'CANCELLED',
  'EXPIRED',
  'VISIT',
  'NOTE',
] as const;
export type MembershipEventType = (typeof MEMBERSHIP_EVENT_TYPES)[number];

export const FREEZE_STATUSES = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type FreezeStatus = (typeof FREEZE_STATUSES)[number];

export const DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SESSION_STATUSES = ['SCHEDULED', 'CANCELLED', 'COMPLETED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const BOOKING_STATUSES = ['CONFIRMED', 'CANCELLED', 'LATE_CANCELLED', 'ATTENDED', 'NO_SHOW'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
/** Statuses that occupy a seat. */
export const SEAT_HOLDING_BOOKING_STATUSES: readonly BookingStatus[] = ['CONFIRMED', 'ATTENDED', 'NO_SHOW'];

export const WAITLIST_STATUSES = ['WAITING', 'PROMOTED', 'CANCELLED', 'EXPIRED'] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const CHECKIN_METHODS = ['QR', 'SEARCH', 'MANUAL_OVERRIDE'] as const;
export type CheckInMethod = (typeof CHECKIN_METHODS)[number];
export const CHECKIN_STATUSES = ['ACCEPTED', 'REJECTED'] as const;
export type CheckInStatus = (typeof CHECKIN_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'REQUIRES_ACTION',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_PURPOSES = ['MEMBERSHIP_PURCHASE', 'MEMBERSHIP_RENEWAL'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const PAYMENT_PROVIDERS = ['SANDBOX', 'MANUAL'] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_METHODS = ['ONLINE', 'CASH', 'CARD_TERMINAL', 'BANK_TRANSFER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RECONCILIATION_STATUSES = ['UNRECONCILED', 'MATCHED', 'DISCREPANCY'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const REFUND_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const PROMOTION_TYPES = ['PERCENT', 'FIXED'] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];
export const PROMOTION_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export const LEAD_SOURCES = [
  'WEBSITE_CONTACT',
  'TRIAL_REQUEST',
  'WALK_IN',
  'PHONE',
  'REFERRAL',
  'SOCIAL',
  'OTHER',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'TRIAL_SCHEDULED', 'NEGOTIATION', 'WON', 'LOST'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_ACTIVITY_TYPES = ['NOTE', 'CALL', 'EMAIL', 'MEETING', 'TASK', 'STATUS_CHANGE', 'ASSIGNMENT'] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export const EXERCISE_CATEGORIES = ['STRENGTH', 'CARDIO', 'MOBILITY', 'CORE', 'PLYOMETRIC', 'RECOVERY'] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];
export const PROGRAM_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];
export const ASSIGNMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const CONTENT_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const EMAIL_STATUSES = ['QUEUED', 'SENT', 'FAILED', 'SKIPPED'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
