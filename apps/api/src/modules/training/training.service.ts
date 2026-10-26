import { Injectable } from '@nestjs/common';
import type { ExerciseInput, ProgramInput, WorkoutLogInput } from '@fitclub/shared';
import { z } from 'zod';
import { assignProgramSchema, updateAssignmentSchema } from '@fitclub/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { keyToDbDate } from '../../common/dates';
import type { AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma } from '../../generated/prisma/client';

const programInclude = {
  trainer: { select: { id: true, displayName: true, slug: true, photoUrl: true } },
  days: {
    orderBy: { dayIndex: 'asc' },
    include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: true } } },
  },
} satisfies Prisma.TrainingProgramInclude;

/**
 * Trainers (training.manage_own) manage programs they own; managers (training.manage_all) manage any.
 * Members only ever see assignments made to them, without the trainer's private notes.
 */
@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private canManageAll(actor: AuthUser) {
    return actor.permissions.includes('training.manage_all');
  }

  private async ownProgram(actor: AuthUser, id: string) {
    const program = await this.prisma.trainingProgram.findUnique({ where: { id } });
    if (!program) throw notFound('Program');
    if (!this.canManageAll(actor) && program.trainerId !== actor.trainerId) throw notFound('Program');
    return program;
  }

  // ───────────── Exercises ─────────────

  listExercises(includeInactive: boolean) {
    return this.prisma.exercise.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async upsertExercise(actor: AuthUser, id: string | null, input: ExerciseInput) {
    const exercise = id
      ? await this.prisma.exercise.update({ where: { id }, data: input })
      : await this.prisma.exercise.create({ data: { ...input, createdById: actor.id } });
    await this.audit.log(actor, {
      action: id ? 'exercise.update' : 'exercise.create',
      entityType: 'Exercise',
      entityId: exercise.id,
    });
    return exercise;
  }

  // ───────────── Programs ─────────────

  listPrograms(actor: AuthUser) {
    return this.prisma.trainingProgram.findMany({
      where: this.canManageAll(actor) ? {} : { trainerId: actor.trainerId ?? '__none__' },
      include: {
        trainer: { select: { displayName: true } },
        _count: { select: { assignments: { where: { status: 'ACTIVE' } }, days: true } },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async getProgram(actor: AuthUser, id: string) {
    await this.ownProgram(actor, id);
    const program = await this.prisma.trainingProgram.findUniqueOrThrow({
      where: { id },
      include: {
        ...programInclude,
        assignments: {
          orderBy: { createdAt: 'desc' },
          include: {
            member: {
              select: {
                id: true,
                memberNumber: true,
                user: { select: { profile: { select: { firstName: true, lastName: true } } } },
              },
            },
            _count: { select: { workoutLogs: true } },
          },
        },
      },
    });
    return program;
  }

  private daysCreate(input: ProgramInput) {
    return input.days.map((d, i) => ({
      dayIndex: i,
      title: d.title,
      weekday: d.weekday,
      notes: d.notes,
      exercises: { create: d.exercises.map((e, j) => ({ ...e, order: j })) },
    }));
  }

  private async assertExercisesExist(input: ProgramInput) {
    const ids = [...new Set(input.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
    const count = await this.prisma.exercise.count({ where: { id: { in: ids } } });
    if (count !== ids.length) throw badRequest('VALIDATION_FAILED', 'Unknown exercise in program');
  }

  async createProgram(actor: AuthUser, input: ProgramInput, trainerId?: string) {
    const ownerId = this.canManageAll(actor) && trainerId ? trainerId : actor.trainerId;
    if (!ownerId) throw forbidden('A trainer profile is required to create programs');
    await this.assertExercisesExist(input);
    const { days: _d, ...rest } = input;
    const program = await this.prisma.trainingProgram.create({
      data: { ...rest, trainerId: ownerId, days: { create: this.daysCreate(input) } },
      include: programInclude,
    });
    await this.audit.log(actor, { action: 'program.create', entityType: 'TrainingProgram', entityId: program.id });
    return program;
  }

  /** Replaces the program's days. Workout logs reference days, so days with logs are kept by index when possible. */
  async updateProgram(actor: AuthUser, id: string, input: ProgramInput) {
    await this.ownProgram(actor, id);
    await this.assertExercisesExist(input);
    const { days: _d, ...rest } = input;
    const program = await this.prisma.transaction(async (tx) => {
      const existing = await tx.programDay.findMany({
        where: { programId: id },
        include: { _count: { select: { workoutLogs: true } } },
      });
      await tx.trainingProgram.update({ where: { id }, data: rest });
      for (const [i, d] of input.days.entries()) {
        const current = existing.find((e) => e.dayIndex === i);
        if (current) {
          await tx.programExercise.deleteMany({ where: { programDayId: current.id } });
          await tx.programDay.update({
            where: { id: current.id },
            data: {
              title: d.title,
              weekday: d.weekday,
              notes: d.notes,
              exercises: { create: d.exercises.map((e, j) => ({ ...e, order: j })) },
            },
          });
        } else {
          await tx.programDay.create({
            data: {
              programId: id,
              dayIndex: i,
              title: d.title,
              weekday: d.weekday,
              notes: d.notes,
              exercises: { create: d.exercises.map((e, j) => ({ ...e, order: j })) },
            },
          });
        }
      }
      for (const extra of existing.filter((e) => e.dayIndex >= input.days.length)) {
        if (extra._count.workoutLogs > 0) {
          throw badRequest(
            'VALIDATION_FAILED',
            'Days with logged workouts cannot be removed — archive the program instead',
          );
        }
        await tx.programDay.delete({ where: { id: extra.id } });
      }
      return tx.trainingProgram.findUniqueOrThrow({ where: { id }, include: programInclude });
    });
    await this.audit.log(actor, { action: 'program.update', entityType: 'TrainingProgram', entityId: id });
    return program;
  }

  async assign(actor: AuthUser, programId: string, input: z.infer<typeof assignProgramSchema>) {
    const program = await this.ownProgram(actor, programId);
    if (program.status !== 'ACTIVE') throw badRequest('VALIDATION_FAILED', 'Only active programs can be assigned');
    const member = await this.prisma.member.findUnique({ where: { id: input.memberId }, include: { user: true } });
    if (!member) throw notFound('Member');
    if (!this.canManageAll(actor) && member.assignedTrainerId !== actor.trainerId) {
      const taught = await this.prisma.booking.count({
        where: { memberId: member.id, session: { trainerId: actor.trainerId ?? '__none__' } },
      });
      if (taught === 0) throw forbidden('Trainers can assign programs to their own clients only');
    }
    const assignment = await this.prisma.programAssignment.create({
      data: {
        programId,
        memberId: input.memberId,
        trainerId: program.trainerId,
        startDate: keyToDbDate(input.startDate),
        memberInstructions: input.memberInstructions,
        trainerNotes: input.trainerNotes,
      },
    });
    const trainer = await this.prisma.trainer.findUniqueOrThrow({ where: { id: program.trainerId } });
    await this.audit.log(actor, {
      action: 'program.assign',
      entityType: 'ProgramAssignment',
      entityId: assignment.id,
      metadata: { memberId: input.memberId },
    });
    await this.notifications.notify(member.userId, 'PROGRAM_ASSIGNED', {
      trainerName: trainer.displayName,
      programName: program.name,
    });
    return assignment;
  }

  async updateAssignment(actor: AuthUser, id: string, input: z.infer<typeof updateAssignmentSchema>) {
    const assignment = await this.prisma.programAssignment.findUnique({ where: { id } });
    if (!assignment) throw notFound('Assignment');
    if (!this.canManageAll(actor) && assignment.trainerId !== actor.trainerId) throw notFound('Assignment');
    const updated = await this.prisma.programAssignment.update({ where: { id }, data: input });
    await this.audit.log(actor, {
      action: 'program.assignment_update',
      entityType: 'ProgramAssignment',
      entityId: id,
      metadata: { status: input.status },
    });
    return updated;
  }

  // ───────────── Member side ─────────────

  async memberPrograms(memberId: string) {
    const assignments = await this.prisma.programAssignment.findMany({
      where: { memberId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        status: true,
        startDate: true,
        memberInstructions: true,
        createdAt: true,
        trainer: { select: { displayName: true, slug: true, photoUrl: true } },
        program: {
          select: {
            id: true,
            name: true,
            description: true,
            goal: true,
            level: true,
            durationWeeks: true,
            days: programInclude.days,
          },
        },
        _count: { select: { workoutLogs: true } },
      },
    });
    return assignments;
  }

  async logWorkout(memberId: string, assignmentId: string, input: WorkoutLogInput) {
    const assignment = await this.prisma.programAssignment.findUnique({
      where: { id: assignmentId },
      include: { program: { include: { days: { include: { exercises: true } } } } },
    });
    if (!assignment || assignment.memberId !== memberId) throw notFound('Assignment');
    if (assignment.status !== 'ACTIVE') throw badRequest('VALIDATION_FAILED', 'This programme is no longer active');
    const day = assignment.program.days.find((d) => d.id === input.programDayId);
    if (!day) throw badRequest('VALIDATION_FAILED', 'Unknown programme day');
    const allowed = new Set(day.exercises.map((e) => e.exerciseId));
    if (input.sets.some((s) => !allowed.has(s.exerciseId)))
      throw badRequest('VALIDATION_FAILED', 'Sets must belong to the selected day');
    const completedAt = input.completedAt ? new Date(input.completedAt) : new Date();
    if (completedAt.getTime() > Date.now() + 60_000)
      throw badRequest('VALIDATION_FAILED', 'Workout cannot be in the future');
    return this.prisma.workoutLog.create({
      data: {
        assignmentId,
        memberId,
        programDayId: day.id,
        completedAt,
        durationMinutes: input.durationMinutes,
        perceivedEffort: input.perceivedEffort,
        notes: input.notes,
        sets: {
          create: input.sets.map((s) => ({
            ...s,
            weightKg: s.weightKg === null ? null : new Prisma.Decimal(s.weightKg),
          })),
        },
      },
      include: { sets: true },
    });
  }

  /** Workout history plus simple progress indicators computed from the logs. */
  async memberWorkouts(memberId: string) {
    const logs = await this.prisma.workoutLog.findMany({
      where: { memberId },
      orderBy: { completedAt: 'desc' },
      take: 100,
      include: {
        day: { select: { title: true } },
        assignment: { select: { program: { select: { name: true } } } },
        sets: { include: { exercise: { select: { id: true, name: true } } } },
      },
    });
    const weekKey = (d: Date) => {
      const t = new Date(d);
      t.setUTCHours(0, 0, 0, 0);
      t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
      return t.toISOString().slice(0, 10);
    };
    const weeks = new Map<string, { workouts: number; volumeKg: number; minutes: number }>();
    const bestLifts = new Map<string, { exerciseId: string; name: unknown; weightKg: number; at: Date }>();
    for (const log of logs) {
      const key = weekKey(log.completedAt);
      const w = weeks.get(key) ?? { workouts: 0, volumeKg: 0, minutes: 0 };
      w.workouts += 1;
      w.minutes += log.durationMinutes ?? 0;
      for (const s of log.sets) {
        const weight = s.weightKg ? Number(s.weightKg) : 0;
        w.volumeKg += weight * (s.reps ?? 0);
        const best = bestLifts.get(s.exerciseId);
        if (weight > 0 && (!best || weight > best.weightKg))
          bestLifts.set(s.exerciseId, {
            exerciseId: s.exerciseId,
            name: s.exercise.name,
            weightKg: weight,
            at: log.completedAt,
          });
      }
      weeks.set(key, w);
    }
    return {
      logs: logs.map((l) => ({
        ...l,
        sets: l.sets.map((s) => ({ ...s, weightKg: s.weightKg === null ? null : Number(s.weightKg) })),
      })),
      progress: {
        totalWorkouts: logs.length,
        weekly: [...weeks.entries()]
          .map(([week, v]) => ({ week, ...v, volumeKg: Math.round(v.volumeKg) }))
          .sort((a, b) => a.week.localeCompare(b.week))
          .slice(-12),
        bestLifts: [...bestLifts.values()].sort((a, b) => b.weightKg - a.weightKg).slice(0, 8),
      },
    };
  }
}
