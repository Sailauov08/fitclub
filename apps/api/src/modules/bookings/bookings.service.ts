import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  checkBookingWindow,
  checkCancellation,
  checkMembershipEligibility,
  localDateKey,
  SEAT_HOLDING_BOOKING_STATUSES,
  type BookingPolicy,
  type BookingStatus,
  type LocalizedText,
} from '@fitclub/shared';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AppError, conflict, forbidden, notFound } from '../../common/errors';
import { keyToDbDate } from '../../common/dates';
import { assertBranchAccess, type AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

const SEAT_HOLDING = SEAT_HOLDING_BOOKING_STATUSES as BookingStatus[];

type SessionForBooking = NonNullable<Awaited<ReturnType<BookingsService['loadSession']>>>;

function rejected(reason: string, message = 'Booking rejected') {
  return new AppError('BOOKING_REJECTED', HttpStatus.CONFLICT, message, { reason });
}

/**
 * Class booking engine. Capacity is enforced in the database:
 *   UPDATE "ClassSession" SET "bookedCount" = "bookedCount" + 1 WHERE id = $1 AND "bookedCount" < "capacity"
 * plus a CHECK constraint (bookedCount <= capacity) and a unique (sessionId, memberId) booking row,
 * so concurrent requests can never oversell a class or double-book a member.
 * The member row is locked (SELECT … FOR UPDATE) to serialise one member's own bookings,
 * which makes the time-conflict and max-active-bookings checks race-free.
 */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger('Bookings');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  loadSession(tx: Tx, sessionId: string) {
    return tx.classSession.findUnique({
      where: { id: sessionId },
      include: { classType: { select: { name: true, slug: true } }, room: { select: { name: true } } },
    });
  }

  /** Throws NOT_ELIGIBLE unless the member holds a membership valid for this session. Returns that membership. */
  private async eligibleMembership(tx: Tx, memberId: string, session: SessionForBooking, now: Date) {
    const memberships = await tx.membership.findMany({
      where: { memberId, status: { in: ['ACTIVE', 'FROZEN', 'PENDING'] } },
      orderBy: { endsAt: 'desc' },
    });
    if (memberships.length === 0) {
      throw new AppError('NOT_ELIGIBLE', HttpStatus.FORBIDDEN, 'An active membership is required', {
        reason: 'NO_MEMBERSHIP',
      });
    }
    let lastReason = 'NO_MEMBERSHIP';
    for (const m of memberships) {
      const result = checkMembershipEligibility(m, {
        at: session.startsAt,
        now,
        branchId: session.branchId,
        purpose: 'class',
      });
      if (!result.eligible) {
        lastReason = result.reason;
        continue;
      }
      const sessionDay = keyToDbDate(localDateKey(session.startsAt));
      const frozen = await tx.membershipFreeze.findFirst({
        where: {
          membershipId: m.id,
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          startDate: { lte: sessionDay },
          endDate: { gt: sessionDay },
        },
      });
      if (frozen) {
        lastReason = 'FROZEN';
        continue;
      }
      return m;
    }
    throw new AppError('NOT_ELIGIBLE', HttpStatus.FORBIDDEN, 'Your membership does not allow this booking', {
      reason: lastReason,
    });
  }

  private async bookInTx(
    tx: Tx,
    params: {
      memberId: string;
      sessionId: string;
      bookedById: string | null;
      fromWaitlist: boolean;
      policy: BookingPolicy;
      now: Date;
    },
  ) {
    const { memberId, sessionId, policy, now } = params;
    await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${memberId} FOR UPDATE`;

    const session = await this.loadSession(tx, sessionId);
    if (!session) throw notFound('Class session');
    const window = checkBookingWindow(session, now, policy);
    if (!window.ok) throw rejected(window.reason);

    const membership = await this.eligibleMembership(tx, memberId, session, now);

    const existing = await tx.booking.findUnique({ where: { sessionId_memberId: { sessionId, memberId } } });
    if (existing && SEAT_HOLDING.includes(existing.status)) throw rejected('ALREADY_BOOKED', 'You are already booked');

    const active = await tx.booking.count({
      where: { memberId, status: 'CONFIRMED', session: { startsAt: { gt: now } } },
    });
    if (active >= policy.maxActiveBookings) throw rejected('TOO_MANY_BOOKINGS');

    const overlapping = await tx.booking.findFirst({
      where: {
        memberId,
        status: 'CONFIRMED',
        session: { status: 'SCHEDULED', startsAt: { lt: session.endsAt }, endsAt: { gt: session.startsAt } },
      },
      select: { id: true },
    });
    if (overlapping) throw rejected('TIME_CONFLICT', 'You already have a class at this time');

    const seat = await tx.$executeRaw`
      UPDATE "ClassSession" SET "bookedCount" = "bookedCount" + 1, "updatedAt" = NOW()
      WHERE id = ${sessionId} AND status = 'SCHEDULED' AND "bookedCount" < capacity`;
    if (seat !== 1) throw rejected('SESSION_FULL', 'This class is full');

    const data = {
      status: 'CONFIRMED' as const,
      membershipId: membership.id,
      bookedById: params.bookedById,
      fromWaitlist: params.fromWaitlist,
      cancelledAt: null,
      attendedAt: null,
      markedById: null,
    };
    const booking = existing
      ? await tx.booking.update({ where: { id: existing.id }, data })
      : await tx.booking.create({ data: { ...data, sessionId, memberId } });

    await tx.waitlistEntry.updateMany({
      where: { sessionId, memberId, status: 'WAITING' },
      data: { status: 'PROMOTED', promotedAt: now },
    });
    return { booking, session };
  }

  async book(actor: AuthUser, memberId: string, sessionId: string, opts: { asStaff: boolean }) {
    const { bookingPolicy: policy } = await this.settings.get();
    if (opts.asStaff) {
      const member = await this.prisma.member.findUnique({ where: { id: memberId } });
      if (!member) throw notFound('Member');
    }
    const { booking, session } = await this.prisma.transaction((tx) =>
      this.bookInTx(tx, { memberId, sessionId, bookedById: actor.id, fromWaitlist: false, policy, now: new Date() }),
    );
    if (opts.asStaff) {
      await this.audit.log(actor, {
        action: 'booking.create_for_member',
        entityType: 'Booking',
        entityId: booking.id,
        branchId: session.branchId,
      });
    }
    await this.notifyMember(memberId, 'BOOKING_CONFIRMED', session);
    return booking;
  }

  private async notifyMember(
    memberId: string,
    type: 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'WAITLIST_PROMOTED' | 'WAITLIST_JOINED' | 'SESSION_CANCELLED',
    session: { classType: { name: unknown }; startsAt: Date; room?: { name: unknown } | null },
    extra: Record<string, unknown> = {},
  ) {
    const member = await this.prisma.member.findUnique({ where: { id: memberId }, select: { userId: true } });
    if (!member) return;
    await this.notifications.notify(member.userId, type, {
      className: session.classType.name as LocalizedText,
      when: session.startsAt.toISOString(),
      room: session.room?.name as LocalizedText | undefined,
      ...extra,
    });
  }

  async cancel(actor: AuthUser, bookingId: string, opts: { asStaff: boolean }) {
    const { bookingPolicy: policy } = await this.settings.get();
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { session: true } });
    if (!booking || (!opts.asStaff && booking.memberId !== actor.memberId)) throw notFound('Booking');
    if (opts.asStaff) assertBranchAccess(actor, booking.session.branchId);

    const decision = checkCancellation(booking.session, booking, new Date(), policy);
    if (!decision.ok) throw rejected(decision.reason, 'This booking can no longer be cancelled');
    // Staff cancellations (e.g. on the member's behalf by phone) are never flagged as late.
    const status: BookingStatus = decision.late && !opts.asStaff ? 'LATE_CANCELLED' : 'CANCELLED';

    await this.prisma.transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: 'CONFIRMED' },
        data: { status, cancelledAt: new Date() },
      });
      if (updated.count !== 1) throw rejected('NOT_CANCELLABLE');
      await tx.$executeRaw`UPDATE "ClassSession" SET "bookedCount" = "bookedCount" - 1, "updatedAt" = NOW() WHERE id = ${booking.sessionId} AND "bookedCount" > 0`;
    });
    if (opts.asStaff)
      await this.audit.log(actor, { action: 'booking.cancel_for_member', entityType: 'Booking', entityId: bookingId });
    const session = await this.loadSession(this.prisma, booking.sessionId);
    if (session) await this.notifyMember(booking.memberId, 'BOOKING_CANCELLED', session);
    await this.promoteWaitlist(booking.sessionId);
    return { status, late: status === 'LATE_CANCELLED' };
  }

  async joinWaitlist(actor: AuthUser, memberId: string, sessionId: string) {
    const { bookingPolicy: policy } = await this.settings.get();
    if (!policy.waitlistEnabled) throw conflict('WAITLIST_DISABLED', 'The waitlist is disabled');
    const now = new Date();
    const { entry, position, session } = await this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionId} FOR UPDATE`;
      const session = await this.loadSession(tx, sessionId);
      if (!session) throw notFound('Class session');
      const window = checkBookingWindow(session, now, policy);
      if (!window.ok) throw rejected(window.reason);
      if (session.bookedCount < session.capacity)
        throw rejected('SPOTS_AVAILABLE', 'Spots are available — book directly');
      await this.eligibleMembership(tx, memberId, session, now);
      const booking = await tx.booking.findUnique({ where: { sessionId_memberId: { sessionId, memberId } } });
      if (booking && SEAT_HOLDING.includes(booking.status)) throw rejected('ALREADY_BOOKED');
      const existing = await tx.waitlistEntry.findUnique({ where: { sessionId_memberId: { sessionId, memberId } } });
      if (existing?.status === 'WAITING') throw conflict('ALREADY_WAITLISTED', 'You are already on the waitlist');
      const size = await tx.waitlistEntry.count({ where: { sessionId, status: 'WAITING' } });
      if (size >= policy.maxWaitlistSize) throw conflict('WAITLIST_FULL', 'The waitlist is full');
      const entry = existing
        ? await tx.waitlistEntry.update({
            where: { id: existing.id },
            data: { status: 'WAITING', createdAt: now, promotedAt: null },
          })
        : await tx.waitlistEntry.create({ data: { sessionId, memberId } });
      return { entry, position: size + 1, session };
    });
    await this.notifyMember(memberId, 'WAITLIST_JOINED', session, { position });
    return { ...entry, position };
  }

  async leaveWaitlist(actor: AuthUser, entryId: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.memberId !== actor.memberId) throw notFound('Waitlist entry');
    await this.prisma.waitlistEntry.updateMany({
      where: { id: entryId, status: 'WAITING' },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Fills freed seats from the waitlist in FIFO order. Members who are no longer eligible
   * (membership lapsed, time conflict, …) are skipped and their entry expires.
   */
  async promoteWaitlist(sessionId: string) {
    const { bookingPolicy: policy } = await this.settings.get();
    for (let i = 0; i < 50; i++) {
      const next = await this.prisma.waitlistEntry.findFirst({
        where: { sessionId, status: 'WAITING' },
        orderBy: { createdAt: 'asc' },
      });
      if (!next) return;
      try {
        const { session } = await this.prisma.transaction((tx) =>
          this.bookInTx(tx, {
            memberId: next.memberId,
            sessionId,
            bookedById: null,
            fromWaitlist: true,
            policy,
            now: new Date(),
          }),
        );
        await this.notifyMember(next.memberId, 'WAITLIST_PROMOTED', session);
      } catch (error) {
        const reason = error instanceof AppError ? (error.details?.reason as string | undefined) : undefined;
        if (reason === 'SESSION_FULL') return;
        if (reason === 'BOOKING_CLOSED' || reason === 'SESSION_STARTED' || reason === 'SESSION_NOT_BOOKABLE') {
          await this.prisma.waitlistEntry.updateMany({
            where: { sessionId, status: 'WAITING' },
            data: { status: 'EXPIRED' },
          });
          return;
        }
        if (!(error instanceof AppError)) {
          this.logger.error({ err: error, sessionId }, 'Waitlist promotion failed');
          return;
        }
        await this.prisma.waitlistEntry.update({ where: { id: next.id }, data: { status: 'EXPIRED' } });
      }
    }
  }

  async promoteWaitlists(sessionIds: string[]) {
    for (const id of new Set(sessionIds)) await this.promoteWaitlist(id);
  }

  /** Releases a member's confirmed seats in [from, to). Used by freezes and cancellations. Returns affected session ids. */
  async cancelMemberBookingsInRange(
    tx: Tx,
    memberId: string,
    from: Date,
    to: Date,
    _reason: string,
    membershipId?: string,
  ) {
    const bookings = await tx.booking.findMany({
      where: {
        memberId,
        status: 'CONFIRMED',
        ...(membershipId ? { membershipId } : {}),
        session: { startsAt: { gte: from, lt: to } },
      },
      select: { id: true, sessionId: true },
    });
    for (const b of bookings) {
      const updated = await tx.booking.updateMany({
        where: { id: b.id, status: 'CONFIRMED' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (updated.count === 1) {
        await tx.$executeRaw`UPDATE "ClassSession" SET "bookedCount" = "bookedCount" - 1, "updatedAt" = NOW() WHERE id = ${b.sessionId} AND "bookedCount" > 0`;
      }
    }
    await tx.waitlistEntry.updateMany({
      where: { memberId, status: 'WAITING', session: { startsAt: { gte: from, lt: to } } },
      data: { status: 'CANCELLED' },
    });
    return bookings.map((b) => b.sessionId);
  }

  async cancelSession(actor: AuthUser, sessionId: string, reason: string) {
    const session = await this.loadSession(this.prisma, sessionId);
    if (!session) throw notFound('Class session');
    assertBranchAccess(actor, session.branchId);
    if (session.status !== 'SCHEDULED') throw conflict('CONFLICT', 'Only scheduled sessions can be cancelled');
    const affected = await this.prisma.transaction(async (tx) => {
      const updated = await tx.classSession.updateMany({
        where: { id: sessionId, status: 'SCHEDULED' },
        data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date(), bookedCount: 0 },
      });
      if (updated.count !== 1) throw conflict('CONFLICT', 'Session already changed');
      const bookings = await tx.booking.findMany({
        where: { sessionId, status: 'CONFIRMED' },
        select: { memberId: true },
      });
      await tx.booking.updateMany({
        where: { sessionId, status: 'CONFIRMED' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await tx.waitlistEntry.updateMany({ where: { sessionId, status: 'WAITING' }, data: { status: 'CANCELLED' } });
      return bookings.map((b) => b.memberId);
    });
    await this.audit.log(actor, {
      action: 'session.cancel',
      entityType: 'ClassSession',
      entityId: sessionId,
      branchId: session.branchId,
      metadata: { reason, affected: affected.length },
    });
    for (const memberId of affected) await this.notifyMember(memberId, 'SESSION_CANCELLED', session, { reason });
    return { affected: affected.length };
  }

  async markAttendance(actor: AuthUser, bookingId: string, status: 'ATTENDED' | 'NO_SHOW') {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { session: true } });
    if (!booking) throw notFound('Booking');
    assertBranchAccess(actor, booking.session.branchId);
    if (actor.staffRole === 'TRAINER' && booking.session.trainerId !== actor.trainerId) {
      throw forbidden('Trainers can only mark attendance for their own classes');
    }
    if (!SEAT_HOLDING.includes(booking.status)) throw conflict('CONFLICT', 'Cancelled bookings cannot be marked');
    const opensAt = booking.session.startsAt.getTime() - 30 * 60_000;
    if (Date.now() < opensAt) throw conflict('CONFLICT', 'Attendance can be marked from 30 minutes before the class');
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status, attendedAt: status === 'ATTENDED' ? new Date() : null, markedById: actor.id },
    });
    await this.audit.log(actor, {
      action: 'attendance.mark',
      entityType: 'Booking',
      entityId: bookingId,
      branchId: booking.session.branchId,
      metadata: { status },
    });
    return updated;
  }

  async memberBookings(memberId: string, scope: 'upcoming' | 'past') {
    const now = new Date();
    const [bookings, waitlist] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          memberId,
          session: scope === 'upcoming' ? { startsAt: { gte: now } } : { startsAt: { lt: now } },
          ...(scope === 'upcoming' ? { status: 'CONFIRMED' } : {}),
        },
        include: {
          session: {
            include: {
              classType: { select: { name: true, slug: true, difficulty: true } },
              trainer: { select: { displayName: true, slug: true, photoUrl: true } },
              room: { select: { name: true } },
              branch: { select: { name: true, slug: true } },
            },
          },
        },
        orderBy: { session: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' } },
        take: scope === 'upcoming' ? 50 : 100,
      }),
      scope === 'upcoming'
        ? this.prisma.waitlistEntry.findMany({
            where: { memberId, status: 'WAITING', session: { startsAt: { gte: now } } },
            include: {
              session: {
                include: { classType: { select: { name: true, slug: true } }, branch: { select: { name: true } } },
              },
            },
            orderBy: { session: { startsAt: 'asc' } },
          })
        : Promise.resolve([]),
    ]);
    const positions = await Promise.all(
      waitlist.map((w) =>
        this.prisma.waitlistEntry.count({
          where: { sessionId: w.sessionId, status: 'WAITING', createdAt: { lte: w.createdAt } },
        }),
      ),
    );
    return { bookings, waitlist: waitlist.map((w, i) => ({ ...w, position: positions[i] })) };
  }
}
