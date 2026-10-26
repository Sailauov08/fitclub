import { z } from 'zod';
import { ASSIGNMENT_STATUSES, EXERCISE_CATEGORIES, PROGRAM_STATUSES, DIFFICULTIES } from '../enums';
import { localizedTextSchema, requiredLocalizedTextSchema } from '../i18n';
import { dateKeySchema, idSchema, urlSchema } from './common';

export const exerciseInputSchema = z.object({
  name: requiredLocalizedTextSchema,
  category: z.enum(EXERCISE_CATEGORIES),
  muscleGroups: z.array(z.string().trim().min(1).max(40)).max(8),
  equipment: z.string().trim().max(80).default(''),
  instructions: localizedTextSchema,
  videoUrl: urlSchema.nullable().default(null),
  isActive: z.boolean().default(true),
});
export type ExerciseInput = z.infer<typeof exerciseInputSchema>;

export const programExerciseSchema = z
  .object({
    exerciseId: idSchema,
    sets: z.coerce.number().int().min(1).max(20),
    reps: z.coerce.number().int().min(1).max(200).nullable(),
    durationSeconds: z.coerce.number().int().min(5).max(7200).nullable(),
    restSeconds: z.coerce.number().int().min(0).max(900),
    notes: z.string().trim().max(500).default(''),
  })
  .refine((e) => e.reps !== null || e.durationSeconds !== null, { message: 'v.repsOrDuration', path: ['reps'] });

export const programDaySchema = z.object({
  title: z.string().trim().min(1).max(80),
  /** 0 = Monday … 6 = Sunday; suggested training day. */
  weekday: z.coerce.number().int().min(0).max(6).nullable(),
  notes: z.string().trim().max(1000).default(''),
  exercises: z.array(programExerciseSchema).min(1, { message: 'v.exercisesRequired' }).max(30),
});

export const programInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(''),
  goal: z.string().trim().max(120).default(''),
  level: z.enum(DIFFICULTIES),
  durationWeeks: z.coerce.number().int().min(1).max(52),
  isTemplate: z.boolean().default(false),
  status: z.enum(PROGRAM_STATUSES).default('ACTIVE'),
  days: z.array(programDaySchema).min(1).max(7),
});
export type ProgramInput = z.infer<typeof programInputSchema>;

export const assignProgramSchema = z.object({
  memberId: idSchema,
  startDate: dateKeySchema,
  memberInstructions: z.string().trim().max(2000).default(''),
  trainerNotes: z.string().trim().max(2000).default(''),
});

export const updateAssignmentSchema = z.object({
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
  memberInstructions: z.string().trim().max(2000).optional(),
  trainerNotes: z.string().trim().max(2000).optional(),
});

export const workoutLogSchema = z.object({
  programDayId: idSchema,
  completedAt: z.iso.datetime({ offset: true }).optional(),
  durationMinutes: z.coerce.number().int().min(1).max(600).nullable(),
  perceivedEffort: z.coerce.number().int().min(1).max(10).nullable(),
  notes: z.string().trim().max(1000).default(''),
  sets: z
    .array(
      z.object({
        exerciseId: idSchema,
        setIndex: z.coerce.number().int().min(1).max(20),
        reps: z.coerce.number().int().min(0).max(500).nullable(),
        weightKg: z.coerce.number().min(0).max(1000).nullable(),
        durationSeconds: z.coerce.number().int().min(0).max(7200).nullable(),
      }),
    )
    .max(300),
});
export type WorkoutLogInput = z.infer<typeof workoutLogSchema>;

export const memberNoteSchema = z.object({ body: z.string().trim().min(1).max(4000) });
