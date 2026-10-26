import type { SessionStatus } from '../enums';

export interface BookingPolicy {
  /** Booking opens this many hours before the session starts. */
  opensHoursBefore: number;
  /** Booking closes this many minutes before the session starts. */
  cutoffMinutes: number;
  /** Cancelling later than this many hours before start counts as a late cancellation. */
  freeCancellationHours: number;
  /** Maximum simultaneous upcoming bookings per member. */
  maxActiveBookings: number;
  waitlistEnabled: boolean;
  maxWaitlistSize: number;
}

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  opensHoursBefore: 168,
  cutoffMinutes: 30,
  freeCancellationHours: 6,
  maxActiveBookings: 10,
  waitlistEnabled: true,
  maxWaitlistSize: 15,
};

export type BookingRejection =
  | 'SESSION_NOT_BOOKABLE'
  | 'SESSION_STARTED'
  | 'BOOKING_NOT_OPEN'
  | 'BOOKING_CLOSED'
  | 'ALREADY_BOOKED'
  | 'TIME_CONFLICT'
  | 'TOO_MANY_BOOKINGS'
  | 'SESSION_FULL';

export function checkBookingWindow(
  session: { status: SessionStatus; startsAt: Date },
  now: Date,
  policy: BookingPolicy,
): { ok: true } | { ok: false; reason: BookingRejection } {
  if (session.status !== 'SCHEDULED') return { ok: false, reason: 'SESSION_NOT_BOOKABLE' };
  const msToStart = session.startsAt.getTime() - now.getTime();
  if (msToStart <= 0) return { ok: false, reason: 'SESSION_STARTED' };
  if (msToStart > policy.opensHoursBefore * 3_600_000) return { ok: false, reason: 'BOOKING_NOT_OPEN' };
  if (msToStart < policy.cutoffMinutes * 60_000) return { ok: false, reason: 'BOOKING_CLOSED' };
  return { ok: true };
}

export type CancellationResult =
  | { ok: true; late: boolean }
  | { ok: false; reason: 'SESSION_STARTED' | 'NOT_CANCELLABLE' };

/** Members may cancel until the session starts; inside the free window the cancellation is flagged as late. */
export function checkCancellation(
  session: { startsAt: Date },
  booking: { status: string },
  now: Date,
  policy: BookingPolicy,
): CancellationResult {
  if (booking.status !== 'CONFIRMED') return { ok: false, reason: 'NOT_CANCELLABLE' };
  const msToStart = session.startsAt.getTime() - now.getTime();
  if (msToStart <= 0) return { ok: false, reason: 'SESSION_STARTED' };
  return { ok: true, late: msToStart < policy.freeCancellationHours * 3_600_000 };
}

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

export function findConflict<T extends TimeRange>(candidate: TimeRange, existing: readonly T[]): T | undefined {
  return existing.find((e) => rangesOverlap(candidate, e));
}

export function availableSpots(capacity: number, booked: number): number {
  return Math.max(0, capacity - booked);
}
