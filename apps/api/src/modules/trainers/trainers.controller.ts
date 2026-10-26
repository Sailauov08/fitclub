import { Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  assignProgramSchema,
  availabilitySchema,
  dateRangeSchema,
  exerciseInputSchema,
  programInputSchema,
  trainerInputSchema,
  updateAssignmentSchema,
  workoutLogSchema,
} from '@fitclub/shared';
import {
  CurrentUser,
  MemberOnly,
  Public,
  RequirePermissions,
  requireMemberId,
  type AuthUser,
} from '../../common/auth-context';
import { ZBody, ZQuery } from '../../common/zod';
import { TrainingService } from '../training/training.service';
import { TrainersService } from './trainers.service';

@ApiTags('trainers')
@Controller('trainers')
export class TrainersController {
  constructor(private readonly trainers: TrainersService) {}

  @Public()
  @Get()
  list() {
    return this.trainers.listPublic();
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.trainers.bySlug(slug);
  }
}

@ApiTags('admin/trainers')
@Controller('admin/trainers')
export class AdminTrainersController {
  constructor(private readonly trainers: TrainersService) {}

  @RequirePermissions(['schedule.read'])
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.trainers.listAdmin(user);
  }

  @RequirePermissions(['analytics.view', 'trainers.manage'], { any: true })
  @Get('workload')
  workload(@CurrentUser() user: AuthUser, @ZQuery(dateRangeSchema) q: z.infer<typeof dateRangeSchema>) {
    return this.trainers.workload(user, q);
  }

  @RequirePermissions(['schedule.read'])
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trainers.getAdmin(user, id);
  }

  @RequirePermissions(['trainers.manage'])
  @Post()
  create(@CurrentUser() user: AuthUser, @ZBody(trainerInputSchema) body: z.infer<typeof trainerInputSchema>) {
    return this.trainers.upsert(user, null, body);
  }

  @RequirePermissions(['trainers.manage'])
  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(trainerInputSchema) body: z.infer<typeof trainerInputSchema>,
  ) {
    return this.trainers.upsert(user, id, body);
  }

  @RequirePermissions(['trainers.manage'])
  @Post(':id/active')
  active(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(z.object({ isActive: z.boolean() })) body: { isActive: boolean },
  ) {
    return this.trainers.setActive(user, id, body.isActive);
  }

  /** Managers edit any trainer's availability; trainers edit their own (checked in the service). */
  @RequirePermissions(['trainers.manage', 'training.manage_own'], { any: true })
  @Put(':id/availability')
  availability(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(availabilitySchema) body: z.infer<typeof availabilitySchema>,
  ) {
    return this.trainers.setAvailability(user, id, body.slots);
  }
}

@ApiTags('admin/training')
@Controller('admin')
export class AdminTrainingController {
  constructor(private readonly training: TrainingService) {}

  @RequirePermissions(['training.manage_own', 'training.manage_all', 'exercises.manage'], { any: true })
  @Get('exercises')
  exercises() {
    return this.training.listExercises(true);
  }

  @RequirePermissions(['exercises.manage'])
  @Post('exercises')
  createExercise(@CurrentUser() user: AuthUser, @ZBody(exerciseInputSchema) body: z.infer<typeof exerciseInputSchema>) {
    return this.training.upsertExercise(user, null, body);
  }

  @RequirePermissions(['exercises.manage'])
  @Put('exercises/:id')
  updateExercise(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(exerciseInputSchema) body: z.infer<typeof exerciseInputSchema>,
  ) {
    return this.training.upsertExercise(user, id, body);
  }

  @RequirePermissions(['training.manage_own', 'training.manage_all'], { any: true })
  @Get('programs')
  programs(@CurrentUser() user: AuthUser) {
    return this.training.listPrograms(user);
  }

  @RequirePermissions(['training.manage_own', 'training.manage_all'], { any: true })
  @Get('programs/:id')
  program(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.training.getProgram(user, id);
  }

  @RequirePermissions(['training.manage_own', 'training.manage_all'], { any: true })
  @Post('programs')
  createProgram(
    @CurrentUser() user: AuthUser,
    @ZBody(programInputSchema.extend({ trainerId: z.string().max(64).optional() }))
    body: z.infer<typeof programInputSchema> & { trainerId?: string },
  ) {
    return this.training.createProgram(user, body, body.trainerId);
  }

  @RequirePermissions(['training.manage_own', 'training.manage_all'], { any: true })
  @Put('programs/:id')
  updateProgram(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(programInputSchema) body: z.infer<typeof programInputSchema>,
  ) {
    return this.training.updateProgram(user, id, body);
  }

  @RequirePermissions(['training.manage_own', 'training.manage_all'], { any: true })
  @Post('programs/:id/assignments')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(assignProgramSchema) body: z.infer<typeof assignProgramSchema>,
  ) {
    return this.training.assign(user, id, body);
  }

  @RequirePermissions(['training.manage_own', 'training.manage_all'], { any: true })
  @Put('assignments/:id')
  updateAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(updateAssignmentSchema) body: z.infer<typeof updateAssignmentSchema>,
  ) {
    return this.training.updateAssignment(user, id, body);
  }
}

@ApiTags('me/training')
@MemberOnly()
@Controller('me')
export class MyTrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get('programs')
  programs(@CurrentUser() user: AuthUser) {
    return this.training.memberPrograms(requireMemberId(user));
  }

  @Post('programs/:assignmentId/workouts')
  log(
    @CurrentUser() user: AuthUser,
    @Param('assignmentId') id: string,
    @ZBody(workoutLogSchema) body: z.infer<typeof workoutLogSchema>,
  ) {
    return this.training.logWorkout(requireMemberId(user), id, body);
  }

  @Get('workouts')
  workouts(@CurrentUser() user: AuthUser) {
    return this.training.memberWorkouts(requireMemberId(user));
  }
}
