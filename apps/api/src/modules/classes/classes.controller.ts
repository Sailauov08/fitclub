import { Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  attendanceSchema,
  bookSessionSchema,
  cancelSessionSchema,
  classCategoryInputSchema,
  classTypeInputSchema,
  scheduleInputSchema,
  sessionInputSchema,
  sessionQuerySchema,
  sessionUpdateSchema,
  staffBookSchema,
} from '@fitclub/shared';
import {
  CurrentUser,
  MemberOnly,
  Public,
  RequirePermissions,
  requireMemberId,
  type AuthUser,
} from '../../common/auth-context';
import { forbidden } from '../../common/errors';
import { ZBody, ZQuery } from '../../common/zod';
import { BookingsService } from '../bookings/bookings.service';
import { ClassesService } from './classes.service';

@ApiTags('classes')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Public()
  @Get('categories')
  categories() {
    return this.classes.listCategories();
  }

  @Public()
  @Get('types')
  types() {
    return this.classes.listClassTypes({ publicOnly: true });
  }

  @Public()
  @Get('types/:slug')
  type(@Param('slug') slug: string) {
    return this.classes.classTypeBySlug(slug);
  }

  /** Public schedule; when signed in as a member each session also carries `myBooking` / `myWaitlist`. */
  @Public()
  @Get('sessions')
  sessions(
    @CurrentUser() user: AuthUser | undefined,
    @ZQuery(sessionQuerySchema) q: z.infer<typeof sessionQuerySchema>,
  ) {
    return this.classes.listSessions(q, { memberId: user?.memberId, publicOnly: true });
  }

  @Public()
  @Get('sessions/:id')
  session(@CurrentUser() user: AuthUser | undefined, @Param('id') id: string) {
    return this.classes.sessionDetail(id, { memberId: user?.memberId });
  }
}

@ApiTags('me/bookings')
@MemberOnly()
@Controller('me')
export class MyBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('bookings')
  upcoming(@CurrentUser() user: AuthUser) {
    return this.bookings.memberBookings(requireMemberId(user), 'upcoming');
  }

  @Get('bookings/history')
  history(@CurrentUser() user: AuthUser) {
    return this.bookings.memberBookings(requireMemberId(user), 'past');
  }

  @Post('bookings')
  book(@CurrentUser() user: AuthUser, @ZBody(bookSessionSchema) body: z.infer<typeof bookSessionSchema>) {
    return this.bookings.book(user, requireMemberId(user), body.sessionId, { asStaff: false });
  }

  @HttpCode(200)
  @Post('bookings/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.cancel(user, id, { asStaff: false });
  }

  @Post('waitlist')
  join(@CurrentUser() user: AuthUser, @ZBody(bookSessionSchema) body: z.infer<typeof bookSessionSchema>) {
    return this.bookings.joinWaitlist(user, requireMemberId(user), body.sessionId);
  }

  @HttpCode(204)
  @Post('waitlist/:id/leave')
  async leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.bookings.leaveWaitlist(user, id);
  }
}

@ApiTags('admin/classes')
@Controller('admin')
export class AdminClassesController {
  constructor(
    private readonly classes: ClassesService,
    private readonly bookings: BookingsService,
  ) {}

  @RequirePermissions(['classes.manage'])
  @Post('class-categories')
  createCategory(
    @CurrentUser() user: AuthUser,
    @ZBody(classCategoryInputSchema) body: z.infer<typeof classCategoryInputSchema>,
  ) {
    return this.classes.upsertCategory(user, null, body);
  }

  @RequirePermissions(['classes.manage'])
  @Put('class-categories/:id')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(classCategoryInputSchema) body: z.infer<typeof classCategoryInputSchema>,
  ) {
    return this.classes.upsertCategory(user, id, body);
  }

  @RequirePermissions(['schedule.read'])
  @Get('class-types')
  types() {
    return this.classes.listClassTypes({ publicOnly: false });
  }

  @RequirePermissions(['classes.manage'])
  @Post('class-types')
  createType(@CurrentUser() user: AuthUser, @ZBody(classTypeInputSchema) body: z.infer<typeof classTypeInputSchema>) {
    return this.classes.upsertClassType(user, null, body);
  }

  @RequirePermissions(['classes.manage'])
  @Put('class-types/:id')
  updateType(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(classTypeInputSchema) body: z.infer<typeof classTypeInputSchema>,
  ) {
    return this.classes.upsertClassType(user, id, body);
  }

  @RequirePermissions(['classes.manage'])
  @Post('class-types/:id/archive')
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(z.object({ archived: z.boolean() })) body: { archived: boolean },
  ) {
    return this.classes.archiveClassType(user, id, body.archived);
  }

  @RequirePermissions(['schedule.read'])
  @Get('schedules')
  schedules(@CurrentUser() user: AuthUser) {
    return this.classes.listSchedules(user);
  }

  @RequirePermissions(['schedule.manage'])
  @Post('schedules')
  createSchedule(@CurrentUser() user: AuthUser, @ZBody(scheduleInputSchema) body: z.infer<typeof scheduleInputSchema>) {
    return this.classes.createSchedule(user, body);
  }

  @RequirePermissions(['schedule.manage'])
  @Put('schedules/:id')
  updateSchedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(scheduleInputSchema) body: z.infer<typeof scheduleInputSchema>,
  ) {
    return this.classes.updateSchedule(user, id, body);
  }

  @RequirePermissions(['schedule.manage'])
  @Post('schedules/:id/deactivate')
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.classes.deactivateSchedule(user, id);
  }

  /** Staff calendar. Trainers see only their own sessions. */
  @RequirePermissions(['schedule.read'])
  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser, @ZQuery(sessionQuerySchema) q: z.infer<typeof sessionQuerySchema>) {
    const query = user.staffRole === 'TRAINER' ? { ...q, trainerId: user.trainerId ?? '__none__' } : q;
    return this.classes.listSessions(query, { publicOnly: false, staffBranchId: user.staffBranchId });
  }

  @RequirePermissions(['schedule.manage'])
  @Post('sessions')
  createSession(@CurrentUser() user: AuthUser, @ZBody(sessionInputSchema) body: z.infer<typeof sessionInputSchema>) {
    return this.classes.createSession(user, body);
  }

  @RequirePermissions(['schedule.manage'])
  @Patch('sessions/:id')
  updateSession(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(sessionUpdateSchema) body: z.infer<typeof sessionUpdateSchema>,
  ) {
    return this.classes.updateSession(user, id, body);
  }

  @RequirePermissions(['sessions.cancel'])
  @HttpCode(200)
  @Post('sessions/:id/cancel')
  cancelSession(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(cancelSessionSchema) body: z.infer<typeof cancelSessionSchema>,
  ) {
    return this.bookings.cancelSession(user, id, body.reason);
  }

  @RequirePermissions(['schedule.read'])
  @Get('sessions/:id/attendees')
  async attendees(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const result = await this.classes.attendees(user, id);
    if (user.staffRole === 'TRAINER' && result.session.trainer.id !== user.trainerId) throw forbidden('Not your class');
    return result;
  }

  @RequirePermissions(['bookings.manage'])
  @Post('bookings')
  bookFor(@CurrentUser() user: AuthUser, @ZBody(staffBookSchema) body: z.infer<typeof staffBookSchema>) {
    return this.bookings.book(user, body.memberId, body.sessionId, { asStaff: true });
  }

  @RequirePermissions(['bookings.manage'])
  @HttpCode(200)
  @Post('bookings/:id/cancel')
  cancelFor(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.cancel(user, id, { asStaff: true });
  }

  @RequirePermissions(['attendance.mark'])
  @Put('bookings/:id/attendance')
  attendance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(attendanceSchema) body: z.infer<typeof attendanceSchema>,
  ) {
    return this.bookings.markAttendance(user, id, body.status);
  }
}
