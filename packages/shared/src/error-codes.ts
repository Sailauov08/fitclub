/**
 * Stable machine-readable error codes returned by the API as `{ error: { code, message, details? } }`.
 * The web app translates them (messages/<locale>.json → errors.<CODE>); `message` is an English fallback.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'CSRF_INVALID',
  'INTERNAL_ERROR',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_SUSPENDED',
  'EMAIL_TAKEN',
  'TOKEN_INVALID',
  'PASSWORD_INCORRECT',
  'NOT_A_MEMBER',
  'ROLE_CHANGE_FORBIDDEN',
  'LAST_OWNER',
  'PLAN_UNAVAILABLE',
  'PLAN_CODE_TAKEN',
  'MEMBERSHIP_ALREADY_ACTIVE',
  'MEMBERSHIP_TRANSITION_INVALID',
  'MEMBERSHIP_NOT_RENEWABLE',
  'FREEZE_REJECTED',
  'SELF_FREEZE_DISABLED',
  'PROMO_INVALID',
  'PAYMENT_STATE_INVALID',
  'PAYMENT_PROVIDER_UNAVAILABLE',
  'REFUND_REJECTED',
  'BOOKING_REJECTED',
  'NOT_ELIGIBLE',
  'WAITLIST_FULL',
  'WAITLIST_DISABLED',
  'ALREADY_WAITLISTED',
  'SESSION_CONFLICT',
  'SCHEDULE_CONFLICT',
  'CHECKIN_REJECTED',
  'ALREADY_CHECKED_IN',
  'QR_INVALID',
  'QR_EXPIRED',
  'LEAD_ALREADY_CONVERTED',
  'UPLOAD_INVALID',
  'SLUG_TAKEN',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** For BOOKING_REJECTED / NOT_ELIGIBLE etc. a `reason`; for VALIDATION_FAILED the field issues. */
    details?: { reason?: string; issues?: { path: string; message: string }[] } & Record<string, unknown>;
  };
}
