import { Injectable } from '@nestjs/common';
import { hhmmToMinutes, type TrainerInput } from '@fitclub/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { badRequest, conflict, notFound } from '../../common/errors';
import { defaultRange, localRange } from '../../common/dates';
import { assertBranchAccess, type AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { sessionPublicInclude, presentSession } from '../classes/classes.service';

const publicSelect = {
  id: true,
  slug: true,
  displayName: true,
  headline: true,
  bio: true,
  specializations: true,
  certifications: true,
  experienceYears: true,
  photoUrl: true,
  offersPersonalTraining: true,
  branch: { select: { id: true, slug: true, name: true } },
} as const;

@Injectable()
export class TrainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listPublic() {
    return this.prisma.trainer.findMany({
      where: { isPublic: true, isActive: true },
      select: publicSelect,
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    });
  }

  async bySlug(slug: string) {
    const trainer = await this.prisma.trainer.findFirst({
      where: { slug, isPublic: true, isActive: true },
      select: publicSelect,
    });
    if (!trainer) throw notFound('Trainer');
    const [upcoming, availability] = await Promise.all([
      this.prisma.classSession.findMany({
        where: { trainerId: trainer.id, status: 'SCHEDULED', startsAt: { gte: new Date() } },
        include: sessionPublicInclude,
        orderBy: { startsAt: 'asc' },
        take: 10,
      }),
      this.prisma.trainerAvailability.findMany({
        where: { trainerId: trainer.id },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      }),
    ]);
    return { ...trainer, upcoming: upcoming.map((s) => presentSession(s)), availability };
  }

  async listAdmin(actor: AuthUser) {
    return this.prisma.trainer.findMany({
      where: actor.staffBranchId ? { branchId: actor.staffBranchId } : {},
      include: {
        branch: { select: { name: true } },
        user: { select: { email: true } },
        _count: { select: { assignedMembers: true, schedules: { where: { isActive: true } } } },
      },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  async getAdmin(actor: AuthUser, id: string) {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
        availability: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
        schedules: {
          where: { isActive: true },
          include: { classType: { select: { name: true } }, room: { select: { name: true } } },
        },
        assignedMembers: {
          select: {
            id: true,
            memberNumber: true,
            user: { select: { profile: { select: { firstName: true, lastName: true } } } },
          },
          take: 100,
        },
      },
    });
    if (!trainer) throw notFound('Trainer');
    assertBranchAccess(actor, trainer.branchId);
    return trainer;
  }

  async upsert(actor: AuthUser, id: string | null, input: TrainerInput) {
    assertBranchAccess(actor, input.branchId);
    const clash = await this.prisma.trainer.findFirst({
      where: { slug: input.slug, ...(id ? { id: { not: id } } : {}) },
    });
    if (clash) throw conflict('SLUG_TAKEN', 'This slug is already used');
    if (input.userId) {
      const staff = await this.prisma.staffMember.findUnique({ where: { userId: input.userId } });
      if (!staff || staff.role !== 'TRAINER')
        throw badRequest('VALIDATION_FAILED', 'Linked user must be a staff member with the Trainer role');
      const linked = await this.prisma.trainer.findFirst({
        where: { userId: input.userId, ...(id ? { id: { not: id } } : {}) },
      });
      if (linked) throw conflict('CONFLICT', 'This user already has a trainer profile');
    }
    const data = {
      slug: input.slug,
      userId: input.userId ?? null,
      displayName: input.displayName,
      headline: input.headline,
      bio: input.bio,
      specializations: input.specializations,
      certifications: input.certifications,
      experienceYears: input.experienceYears,
      photoUrl: input.photoUrl,
      branchId: input.branchId,
      offersPersonalTraining: input.offersPersonalTraining,
      isPublic: input.isPublic,
      sortOrder: input.sortOrder,
    };
    const trainer = id
      ? await this.prisma.trainer.update({ where: { id }, data })
      : await this.prisma.trainer.create({ data });
    await this.audit.log(actor, {
      action: id ? 'trainer.update' : 'trainer.create',
      entityType: 'Trainer',
      entityId: trainer.id,
      branchId: trainer.branchId,
    });
    return trainer;
  }

  async setActive(actor: AuthUser, id: string, isActive: boolean) {
    const trainer = await this.prisma.trainer.update({ where: { id }, data: { isActive } });
    await this.audit.log(actor, {
      action: isActive ? 'trainer.activate' : 'trainer.deactivate',
      entityType: 'Trainer',
      entityId: id,
    });
    return trainer;
  }

  async setAvailability(
    actor: AuthUser,
    id: string,
    slots: { weekday: number; startTime: string; endTime: string; branchId: string }[],
  ) {
    const trainer = await this.prisma.trainer.findUnique({ where: { id } });
    if (!trainer) throw notFound('Trainer');
    if (actor.staffRole === 'TRAINER' && actor.trainerId !== id) throw notFound('Trainer');
    assertBranchAccess(actor, trainer.branchId);
    const rows = slots.map((s) => ({
      trainerId: id,
      branchId: s.branchId,
      weekday: s.weekday,
      startMinute: hhmmToMinutes(s.startTime),
      endMinute: hhmmToMinutes(s.endTime),
    }));
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i]!;
        const b = rows[j]!;
        if (a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute) {
          throw badRequest('VALIDATION_FAILED', 'Availability slots overlap', {
            issues: [{ path: `slots.${j}`, message: 'v.overlap' }],
          });
        }
      }
    }
    await this.prisma.$transaction([
      this.prisma.trainerAvailability.deleteMany({ where: { trainerId: id } }),
      this.prisma.trainerAvailability.createMany({ data: rows }),
    ]);
    await this.audit.log(actor, {
      action: 'trainer.availability',
      entityType: 'Trainer',
      entityId: id,
      metadata: { slots: rows.length },
    });
    return this.prisma.trainerAvailability.findMany({
      where: { trainerId: id },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    });
  }

  /**
   * Performance indicators from real records in the range:
   *  sessions = non-cancelled sessions led, hours = their total duration,
   *  fillRate = seats taken / capacity, attendanceRate = attended / (attended + no-show).
   */
  async workload(actor: AuthUser, range?: { from?: string; to?: string }) {
    const { from, to } = range?.from && range?.to ? { from: range.from, to: range.to } : defaultRange(30);
    const where = {
      startsAt: localRange(from, to),
      status: { not: 'CANCELLED' as const },
      ...(actor.staffBranchId ? { branchId: actor.staffBranchId } : {}),
    };
    const trainers = await this.prisma.trainer.findMany({
      where: { isActive: true, ...(actor.staffBranchId ? { branchId: actor.staffBranchId } : {}) },
      select: { id: true, displayName: true, slug: true },
    });
    const [sessions, attendance, assigned, programs] = await Promise.all([
      this.prisma.classSession.findMany({
        where,
        select: { trainerId: true, capacity: true, bookedCount: true, startsAt: true, endsAt: true },
      }),
      this.prisma.booking.findMany({
        where: { session: where, status: { in: ['ATTENDED', 'NO_SHOW'] } },
        select: { status: true, session: { select: { trainerId: true } } },
      }),
      this.prisma.member.groupBy({
        by: ['assignedTrainerId'],
        where: { assignedTrainerId: { not: null } },
        _count: true,
      }),
      this.prisma.programAssignment.groupBy({ by: ['trainerId'], where: { status: 'ACTIVE' }, _count: true }),
    ]);
    return {
      from,
      to,
      trainers: trainers.map((t) => {
        const mine = sessions.filter((s) => s.trainerId === t.id);
        const capacity = mine.reduce((s, x) => s + x.capacity, 0);
        const booked = mine.reduce((s, x) => s + x.bookedCount, 0);
        const att = attendance.filter((a) => a.session.trainerId === t.id);
        const attended = att.filter((a) => a.status === 'ATTENDED').length;
        return {
          ...t,
          sessions: mine.length,
          hours: Math.round(mine.reduce((s, x) => s + (x.endsAt.getTime() - x.startsAt.getTime()), 0) / 360_000) / 10,
          fillRate: capacity ? booked / capacity : null,
          attendanceRate: att.length ? attended / att.length : null,
          assignedMembers: assigned.find((a) => a.assignedTrainerId === t.id)?._count ?? 0,
          activePrograms: programs.find((p) => p.trainerId === t.id)?._count ?? 0,
        };
      }),
    };
  }
}
