import { Injectable } from '@nestjs/common';
import {
  addDaysToKey,
  availableSpots,
  hhmmToMinutes,
  localWeekday,
  minutesToHHMM,
  zonedDateTime,
  type ClassTypeInput,
  type ScheduleInput,
} from '@fitclub/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { badRequest, conflict, notFound } from '../../common/errors';
import { dbDateToKey, keyToDbDate, todayKey } from '../../common/dates';
import { assertBranchAccess, type AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { classCategoryInputSchema, sessionInputSchema, sessionQuerySchema, sessionUpdateSchema } from '@fitclub/shared';

const GENERATE_DAYS = 28;
const MAX_RANGE_DAYS = 62;

export const sessionPublicInclude = {
  classType: {
    select: {
      id: true,
      slug: true,
      name: true,
      summary: true,
      difficulty: true,
      intensity: true,
      imageUrl: true,
      category: { select: { id: true, slug: true, name: true } },
    },
  },
  trainer: { select: { id: true, slug: true, displayName: true, photoUrl: true } },
  room: { select: { id: true, name: true } },
  branch: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.ClassSessionInclude;

type SessionRow = Prisma.ClassSessionGetPayload<{ include: typeof sessionPublicInclude }>;

/**
 * Removes future sessions that hold no seats. Sessions that ever had a booking or waitlist row
 * are cancelled instead of deleted so members' booking history stays intact.
 */
async function retireSessions(tx: Tx, ids: string[]) {
  if (ids.length === 0) return;
  const withHistory = await tx.classSession.findMany({
    where: { id: { in: ids }, OR: [{ bookings: { some: {} } }, { waitlist: { some: {} } }] },
    select: { id: true },
  });
  const keep = new Set(withHistory.map((s) => s.id));
  await tx.classSession.updateMany({
    where: { id: { in: [...keep] } },
    data: { status: 'CANCELLED', cancelReason: 'Schedule ended', cancelledAt: new Date() },
  });
  await tx.waitlistEntry.updateMany({
    where: { sessionId: { in: [...keep] }, status: 'WAITING' },
    data: { status: 'CANCELLED' },
  });
  await tx.classSession.deleteMany({ where: { id: { in: ids.filter((id) => !keep.has(id)) } } });
}

export function presentSession(
  s: SessionRow,
  mine?: { booking?: { id: string; status: string } | null; waitlist?: { id: string } | null },
) {
  return {
    id: s.id,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    status: s.status,
    capacity: s.capacity,
    bookedCount: s.bookedCount,
    spotsLeft: availableSpots(s.capacity, s.bookedCount),
    cancelReason: s.cancelReason,
    classType: s.classType,
    trainer: s.trainer,
    room: s.room,
    branch: s.branch,
    myBooking: mine?.booking ?? null,
    myWaitlist: mine?.waitlist ?? null,
  };
}

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Catalog ─────────────

  listCategories() {
    return this.prisma.classCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { classTypes: true } } },
    });
  }

  async upsertCategory(actor: AuthUser, id: string | null, input: z.infer<typeof classCategoryInputSchema>) {
    const clash = await this.prisma.classCategory.findFirst({
      where: { slug: input.slug, ...(id ? { id: { not: id } } : {}) },
    });
    if (clash) throw conflict('SLUG_TAKEN', 'This slug is already used');
    const category = id
      ? await this.prisma.classCategory.update({ where: { id }, data: input })
      : await this.prisma.classCategory.create({ data: input });
    await this.audit.log(actor, {
      action: id ? 'class_category.update' : 'class_category.create',
      entityType: 'ClassCategory',
      entityId: category.id,
    });
    return category;
  }

  listClassTypes(opts: { publicOnly: boolean }) {
    return this.prisma.classType.findMany({
      where: opts.publicOnly ? { isPublic: true, isArchived: false } : {},
      include: { category: true },
      orderBy: [{ isArchived: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async classTypeBySlug(slug: string) {
    const type = await this.prisma.classType.findFirst({
      where: { slug, isPublic: true, isArchived: false },
      include: { category: true },
    });
    if (!type) throw notFound('Class');
    const upcoming = await this.prisma.classSession.findMany({
      where: { classTypeId: type.id, status: 'SCHEDULED', startsAt: { gte: new Date() } },
      include: sessionPublicInclude,
      orderBy: { startsAt: 'asc' },
      take: 12,
    });
    const trainers = await this.prisma.trainer.findMany({
      where: { isPublic: true, isActive: true, schedules: { some: { classTypeId: type.id, isActive: true } } },
      select: { id: true, slug: true, displayName: true, photoUrl: true, headline: true },
    });
    return { ...type, upcoming: upcoming.map((s) => presentSession(s)), trainers };
  }

  async upsertClassType(actor: AuthUser, id: string | null, input: ClassTypeInput) {
    const clash = await this.prisma.classType.findFirst({
      where: { slug: input.slug, ...(id ? { id: { not: id } } : {}) },
    });
    if (clash) throw conflict('SLUG_TAKEN', 'This slug is already used');
    const type = id
      ? await this.prisma.classType.update({ where: { id }, data: input })
      : await this.prisma.classType.create({ data: input });
    await this.audit.log(actor, {
      action: id ? 'class_type.update' : 'class_type.create',
      entityType: 'ClassType',
      entityId: type.id,
    });
    return type;
  }

  async archiveClassType(actor: AuthUser, id: string, archived: boolean) {
    const type = await this.prisma.classType.update({ where: { id }, data: { isArchived: archived } });
    await this.audit.log(actor, {
      action: archived ? 'class_type.archive' : 'class_type.restore',
      entityType: 'ClassType',
      entityId: id,
    });
    return type;
  }

  // ───────────── Recurring schedules ─────────────

  listSchedules(actor: AuthUser) {
    return this.prisma.classSchedule.findMany({
      where: actor.staffBranchId ? { branchId: actor.staffBranchId } : {},
      include: {
        classType: { select: { name: true, slug: true } },
        trainer: { select: { displayName: true } },
        room: { select: { name: true } },
        branch: { select: { name: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: [{ isActive: 'desc' }, { weekday: 'asc' }, { startMinute: 'asc' }],
    });
  }

  /** Rejects a schedule that would double-book its room or trainer on the same weekday. */
  private async assertNoScheduleConflict(input: ScheduleInput, ignoreId?: string) {
    const start = hhmmToMinutes(input.startTime);
    const end = start + input.durationMinutes;
    const candidates = await this.prisma.classSchedule.findMany({
      where: {
        isActive: true,
        weekday: input.weekday,
        id: ignoreId ? { not: ignoreId } : undefined,
        OR: [{ roomId: input.roomId }, { trainerId: input.trainerId }],
        AND: [
          { OR: [{ validUntil: null }, { validUntil: { gte: keyToDbDate(input.validFrom) } }] },
          ...(input.validUntil ? [{ validFrom: { lte: keyToDbDate(input.validUntil) } }] : []),
        ],
      },
    });
    const clash = candidates.find((c) => c.startMinute < end && start < c.startMinute + c.durationMinutes);
    if (clash) {
      throw conflict('SCHEDULE_CONFLICT', 'The room or trainer is already booked at this time', {
        conflictWith: clash.id,
        resource: clash.roomId === input.roomId ? 'room' : 'trainer',
        time: minutesToHHMM(clash.startMinute),
      });
    }
  }

  private async validateRefs(input: { classTypeId: string; trainerId: string; roomId: string; capacity: number }) {
    const [type, trainer, room] = await Promise.all([
      this.prisma.classType.findUnique({ where: { id: input.classTypeId } }),
      this.prisma.trainer.findUnique({ where: { id: input.trainerId } }),
      this.prisma.room.findUnique({ where: { id: input.roomId } }),
    ]);
    if (!type || type.isArchived) throw badRequest('VALIDATION_FAILED', 'Unknown class type');
    if (!trainer || !trainer.isActive) throw badRequest('VALIDATION_FAILED', 'Unknown trainer');
    if (!room || !room.isActive) throw badRequest('VALIDATION_FAILED', 'Unknown room');
    if (input.capacity > room.capacity) {
      throw badRequest('VALIDATION_FAILED', `Capacity exceeds the room limit (${room.capacity})`, {
        issues: [{ path: 'capacity', message: 'v.roomCapacity' }],
      });
    }
    return { type, trainer, room };
  }

  async createSchedule(actor: AuthUser, input: ScheduleInput) {
    const { room } = await this.validateRefs(input);
    assertBranchAccess(actor, room.branchId);
    await this.assertNoScheduleConflict(input);
    const schedule = await this.prisma.classSchedule.create({
      data: {
        classTypeId: input.classTypeId,
        trainerId: input.trainerId,
        roomId: input.roomId,
        branchId: room.branchId,
        weekday: input.weekday,
        startMinute: hhmmToMinutes(input.startTime),
        durationMinutes: input.durationMinutes,
        capacity: input.capacity,
        validFrom: keyToDbDate(input.validFrom),
        validUntil: input.validUntil ? keyToDbDate(input.validUntil) : null,
      },
    });
    const generated = await this.generateSessions({ scheduleId: schedule.id });
    await this.audit.log(actor, {
      action: 'schedule.create',
      entityType: 'ClassSchedule',
      entityId: schedule.id,
      branchId: room.branchId,
      metadata: { generated },
    });
    return { schedule, generated };
  }

  /**
   * Trainer, room, capacity and end date can change; future sessions are updated to match.
   * Changing weekday/time means a new schedule (existing bookings keep their time).
   */
  async updateSchedule(actor: AuthUser, id: string, input: ScheduleInput) {
    const current = await this.prisma.classSchedule.findUnique({ where: { id } });
    if (!current) throw notFound('Schedule');
    assertBranchAccess(actor, current.branchId);
    if (
      current.weekday !== input.weekday ||
      current.startMinute !== hhmmToMinutes(input.startTime) ||
      current.durationMinutes !== input.durationMinutes
    ) {
      throw badRequest(
        'VALIDATION_FAILED',
        'Weekday, time and duration cannot change — end this schedule and create a new one',
        {
          issues: [{ path: 'startTime', message: 'v.scheduleTimeLocked' }],
        },
      );
    }
    const { room } = await this.validateRefs(input);
    if (room.branchId !== current.branchId)
      throw badRequest('VALIDATION_FAILED', 'A schedule cannot move to another branch');
    await this.assertNoScheduleConflict(input, id);
    const now = new Date();
    const result = await this.prisma.transaction(async (tx) => {
      const schedule = await tx.classSchedule.update({
        where: { id },
        data: {
          classTypeId: input.classTypeId,
          trainerId: input.trainerId,
          roomId: input.roomId,
          capacity: input.capacity,
          validUntil: input.validUntil ? keyToDbDate(input.validUntil) : null,
        },
      });
      const future = await tx.classSession.findMany({
        where: { scheduleId: id, status: 'SCHEDULED', startsAt: { gte: now } },
      });
      let removed = 0;
      for (const s of future) {
        const beyondEnd = input.validUntil && s.startsAt >= zonedDateTime(addDaysToKey(input.validUntil, 1));
        if (beyondEnd && s.bookedCount === 0) {
          await retireSessions(tx, [s.id]);
          removed += 1;
          continue;
        }
        await tx.classSession.update({
          where: { id: s.id },
          data: {
            trainerId: input.trainerId,
            roomId: input.roomId,
            classTypeId: input.classTypeId,
            capacity: Math.max(input.capacity, s.bookedCount),
          },
        });
      }
      return { schedule, updated: future.length - removed, removed };
    });
    await this.generateSessions({ scheduleId: id });
    await this.audit.log(actor, {
      action: 'schedule.update',
      entityType: 'ClassSchedule',
      entityId: id,
      branchId: current.branchId,
      metadata: { updated: result.updated, removed: result.removed },
    });
    return result;
  }

  /** Deactivates a schedule; future sessions without bookings are removed, booked ones stay for staff to cancel. */
  async deactivateSchedule(actor: AuthUser, id: string) {
    const schedule = await this.prisma.classSchedule.findUnique({ where: { id } });
    if (!schedule) throw notFound('Schedule');
    assertBranchAccess(actor, schedule.branchId);
    const now = new Date();
    const removed = await this.prisma.transaction(async (tx) => {
      await tx.classSchedule.update({ where: { id }, data: { isActive: false } });
      const empty = await tx.classSession.findMany({
        where: { scheduleId: id, status: 'SCHEDULED', startsAt: { gte: now }, bookedCount: 0 },
        select: { id: true },
      });
      const ids = empty.map((s) => s.id);
      await retireSessions(tx, ids);
      return ids.length;
    });
    await this.audit.log(actor, {
      action: 'schedule.deactivate',
      entityType: 'ClassSchedule',
      entityId: id,
      branchId: schedule.branchId,
      metadata: { removed },
    });
    return { removed };
  }

  /** Materialises sessions for the next GENERATE_DAYS days. Idempotent (unique scheduleId+startsAt). */
  async generateSessions(opts: { scheduleId?: string; fromKey?: string; days?: number } = {}) {
    const fromKey = opts.fromKey ?? todayKey();
    const days = opts.days ?? GENERATE_DAYS;
    const schedules = await this.prisma.classSchedule.findMany({
      where: { isActive: true, ...(opts.scheduleId ? { id: opts.scheduleId } : {}) },
    });
    const rows: Prisma.ClassSessionCreateManyInput[] = [];
    const now = Date.now();
    for (let i = 0; i < days; i++) {
      const key = addDaysToKey(fromKey, i);
      const weekday = localWeekday(zonedDateTime(key, 12 * 60));
      for (const s of schedules) {
        if (s.weekday !== weekday) continue;
        if (key < dbDateToKey(s.validFrom) || (s.validUntil && key > dbDateToKey(s.validUntil))) continue;
        const startsAt = zonedDateTime(key, s.startMinute);
        if (startsAt.getTime() < now) continue;
        rows.push({
          classTypeId: s.classTypeId,
          scheduleId: s.id,
          trainerId: s.trainerId,
          roomId: s.roomId,
          branchId: s.branchId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + s.durationMinutes * 60_000),
          capacity: s.capacity,
        });
      }
    }
    if (rows.length === 0) return 0;
    const created = await this.prisma.classSession.createMany({ data: rows, skipDuplicates: true });
    return created.count;
  }

  // ───────────── Sessions ─────────────

  private async assertNoSessionConflict(params: {
    roomId: string;
    trainerId: string;
    startsAt: Date;
    endsAt: Date;
    ignoreId?: string;
  }) {
    const clash = await this.prisma.classSession.findFirst({
      where: {
        status: 'SCHEDULED',
        id: params.ignoreId ? { not: params.ignoreId } : undefined,
        OR: [{ roomId: params.roomId }, { trainerId: params.trainerId }],
        startsAt: { lt: params.endsAt },
        endsAt: { gt: params.startsAt },
      },
    });
    if (clash) {
      throw conflict('SCHEDULE_CONFLICT', 'The room or trainer is busy at this time', {
        conflictWith: clash.id,
        resource: clash.roomId === params.roomId ? 'room' : 'trainer',
      });
    }
  }

  async createSession(actor: AuthUser, input: z.infer<typeof sessionInputSchema>) {
    const { room } = await this.validateRefs(input);
    assertBranchAccess(actor, room.branchId);
    const startsAt = zonedDateTime(input.date, hhmmToMinutes(input.startTime));
    if (startsAt.getTime() < Date.now())
      throw badRequest('VALIDATION_FAILED', 'Session must start in the future', {
        issues: [{ path: 'date', message: 'v.future' }],
      });
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
    await this.assertNoSessionConflict({ roomId: input.roomId, trainerId: input.trainerId, startsAt, endsAt });
    const session = await this.prisma.classSession.create({
      data: {
        classTypeId: input.classTypeId,
        trainerId: input.trainerId,
        roomId: input.roomId,
        branchId: room.branchId,
        startsAt,
        endsAt,
        capacity: input.capacity,
      },
    });
    await this.audit.log(actor, {
      action: 'session.create',
      entityType: 'ClassSession',
      entityId: session.id,
      branchId: room.branchId,
    });
    return session;
  }

  async updateSession(actor: AuthUser, id: string, input: z.infer<typeof sessionUpdateSchema>) {
    const session = await this.prisma.classSession.findUnique({ where: { id }, include: { room: true } });
    if (!session) throw notFound('Class session');
    assertBranchAccess(actor, session.branchId);
    if (session.status !== 'SCHEDULED') throw conflict('CONFLICT', 'Only scheduled sessions can be edited');
    const roomId = input.roomId ?? session.roomId;
    const trainerId = input.trainerId ?? session.trainerId;
    const capacity = input.capacity ?? session.capacity;
    const room =
      roomId === session.roomId ? session.room : await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.branchId !== session.branchId)
      throw badRequest('VALIDATION_FAILED', 'Room must belong to the same branch');
    if (capacity > room.capacity)
      throw badRequest('VALIDATION_FAILED', `Capacity exceeds the room limit (${room.capacity})`);
    if (capacity < session.bookedCount) {
      throw conflict('CONFLICT', `Capacity cannot be lower than current bookings (${session.bookedCount})`, {
        bookedCount: session.bookedCount,
      });
    }
    await this.assertNoSessionConflict({
      roomId,
      trainerId,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      ignoreId: id,
    });
    // Guarded by the CHECK constraint as well: a concurrent booking cannot push bookedCount above the new capacity.
    const updated = await this.prisma.classSession.update({ where: { id }, data: { roomId, trainerId, capacity } });
    await this.audit.log(actor, {
      action: 'session.update',
      entityType: 'ClassSession',
      entityId: id,
      branchId: session.branchId,
      metadata: input,
    });
    return updated;
  }

  async listSessions(
    query: z.infer<typeof sessionQuerySchema>,
    opts: { memberId?: string | null; publicOnly: boolean; staffBranchId?: string | null },
  ) {
    const from = query.from ?? todayKey();
    let to = query.to ?? addDaysToKey(from, 6);
    if (to < from) to = from;
    if (addDaysToKey(from, MAX_RANGE_DAYS) < to) to = addDaysToKey(from, MAX_RANGE_DAYS);
    const branchId = opts.staffBranchId ?? query.branchId;
    const sessions = await this.prisma.classSession.findMany({
      where: {
        startsAt: { gte: zonedDateTime(from), lt: zonedDateTime(addDaysToKey(to, 1)) },
        ...(branchId ? { branchId } : {}),
        ...(query.trainerId ? { trainerId: query.trainerId } : {}),
        ...(query.classTypeId ? { classTypeId: query.classTypeId } : {}),
        classType: {
          ...(opts.publicOnly ? { isPublic: true } : {}),
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.difficulty ? { difficulty: query.difficulty } : {}),
        },
      },
      include: sessionPublicInclude,
      orderBy: { startsAt: 'asc' },
      take: 1000,
    });
    let mine = new Map<string, { booking?: { id: string; status: string } | null; waitlist?: { id: string } | null }>();
    if (opts.memberId && sessions.length > 0) {
      const ids = sessions.map((s) => s.id);
      const [bookings, waitlist] = await Promise.all([
        this.prisma.booking.findMany({
          where: { memberId: opts.memberId, sessionId: { in: ids } },
          select: { id: true, sessionId: true, status: true },
        }),
        this.prisma.waitlistEntry.findMany({
          where: { memberId: opts.memberId, sessionId: { in: ids }, status: 'WAITING' },
          select: { id: true, sessionId: true },
        }),
      ]);
      mine = new Map(ids.map((id) => [id, { booking: null, waitlist: null }]));
      for (const b of bookings) mine.get(b.sessionId)!.booking = { id: b.id, status: b.status };
      for (const w of waitlist) mine.get(w.sessionId)!.waitlist = { id: w.id };
    }
    return { from, to, sessions: sessions.map((s) => presentSession(s, mine.get(s.id))) };
  }

  async sessionDetail(id: string, opts: { memberId?: string | null }) {
    const session = await this.prisma.classSession.findUnique({ where: { id }, include: sessionPublicInclude });
    if (!session) throw notFound('Class session');
    let mine;
    if (opts.memberId) {
      const [booking, waitlist] = await Promise.all([
        this.prisma.booking.findUnique({
          where: { sessionId_memberId: { sessionId: id, memberId: opts.memberId } },
          select: { id: true, status: true },
        }),
        this.prisma.waitlistEntry.findFirst({
          where: { sessionId: id, memberId: opts.memberId, status: 'WAITING' },
          select: { id: true },
        }),
      ]);
      mine = { booking, waitlist };
    }
    return presentSession(session, mine);
  }

  async attendees(actor: AuthUser, id: string) {
    const session = await this.prisma.classSession.findUnique({ where: { id }, include: sessionPublicInclude });
    if (!session) throw notFound('Class session');
    assertBranchAccess(actor, session.branchId);
    const [bookings, waitlist] = await Promise.all([
      this.prisma.booking.findMany({
        where: { sessionId: id },
        orderBy: { createdAt: 'asc' },
        include: {
          member: {
            select: {
              id: true,
              memberNumber: true,
              user: {
                select: {
                  email: true,
                  profile: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.waitlistEntry.findMany({
        where: { sessionId: id, status: 'WAITING' },
        orderBy: { createdAt: 'asc' },
        include: {
          member: {
            select: {
              id: true,
              memberNumber: true,
              user: { select: { profile: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      }),
    ]);
    return { session: presentSession(session), bookings, waitlist };
  }

  /** Job: sessions that ended become COMPLETED; remaining CONFIRMED bookings become NO_SHOW. */
  async completePastSessions(now = new Date()) {
    const past = await this.prisma.classSession.findMany({
      where: { status: 'SCHEDULED', endsAt: { lt: new Date(now.getTime() - 2 * 3_600_000) } },
      select: { id: true },
    });
    for (const s of past) {
      await this.prisma.$transaction([
        this.prisma.booking.updateMany({
          where: { sessionId: s.id, status: 'CONFIRMED' },
          data: { status: 'NO_SHOW' },
        }),
        this.prisma.waitlistEntry.updateMany({
          where: { sessionId: s.id, status: 'WAITING' },
          data: { status: 'EXPIRED' },
        }),
        this.prisma.classSession.update({ where: { id: s.id }, data: { status: 'COMPLETED' } }),
      ]);
    }
    return past.length;
  }
}
