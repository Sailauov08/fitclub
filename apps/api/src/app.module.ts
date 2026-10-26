import { Global, Module, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { env } from './config/env';
import { PrismaModule } from './prisma/prisma.service';
import { AllExceptionsFilter } from './common/exception.filter';
import { AuthGuard } from './common/guards';
import { SettingsService } from './modules/settings/settings.service';
import { AuditService } from './modules/audit/audit.service';
import { EmailService } from './modules/notifications/email.service';
import { NotificationsService } from './modules/notifications/notifications.service';
import { StorageService } from './modules/media/storage.service';
import { SessionService } from './modules/auth/session.service';
import { PasswordService } from './modules/auth/password.service';
import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';
import { ProfileController } from './modules/profile/profile.controller';
import { PlansService } from './modules/plans/plans.service';
import { MembershipsService } from './modules/memberships/memberships.service';
import {
  AdminMembershipsController,
  AdminPlansController,
  MyMembershipsController,
  PlansController,
} from './modules/memberships/memberships.controller';
import { BookingsService } from './modules/bookings/bookings.service';
import { PromotionsService } from './modules/promotions/promotions.service';
import { SandboxPaymentProvider } from './modules/payments/providers';
import { PaymentsService } from './modules/payments/payments.service';
import {
  AdminPaymentsController,
  MyPaymentsController,
  PaymentsController,
  PromotionsController,
} from './modules/payments/payments.controller';
import { ClassesService } from './modules/classes/classes.service';
import { AdminClassesController, ClassesController, MyBookingsController } from './modules/classes/classes.controller';
import { CheckInService } from './modules/checkin/checkin.service';
import { AdminCheckInController, MyCheckInController } from './modules/checkin/checkin.controller';
import { MembersService } from './modules/members/members.service';
import { AdminMembersController } from './modules/members/members.controller';
import { TrainersService } from './modules/trainers/trainers.service';
import { TrainingService } from './modules/training/training.service';
import {
  AdminTrainersController,
  AdminTrainingController,
  MyTrainingController,
  TrainersController,
} from './modules/trainers/trainers.controller';
import { LeadsService } from './modules/leads/leads.service';
import { LeadsController } from './modules/leads/leads.controller';
import { StaffService } from './modules/staff/staff.service';
import { StaffController } from './modules/staff/staff.controller';
import { BranchesController } from './modules/branches/branches.controller';
import { ContentController } from './modules/content/content.controller';
import { AuditController, SettingsController } from './modules/settings/settings.controller';
import { AnalyticsService } from './modules/analytics/analytics.service';
import { AnalyticsController } from './modules/analytics/analytics.controller';
import { HealthController } from './modules/health/health.controller';
import { JobsService } from './modules/jobs/jobs.service';
import { CronController } from './modules/jobs/cron.controller';

/** Cross-cutting services used by every feature. */
@Global()
@Module({
  providers: [
    SettingsService,
    AuditService,
    EmailService,
    NotificationsService,
    StorageService,
    SessionService,
    PasswordService,
  ],
  exports: [
    SettingsService,
    AuditService,
    EmailService,
    NotificationsService,
    StorageService,
    SessionService,
    PasswordService,
  ],
})
class CoreModule {}

/**
 * The API is a modular monolith: one deployable with feature folders under src/modules.
 * Services depend on each other in one direction only:
 *   bookings ← memberships ← payments ← (checkout controllers, jobs)
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers["x-csrf-token"]',
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
        customProps: () => ({ service: 'fitclub-api' }),
        autoLogging: { ignore: (req) => req.url === '/api/health' },
      },
      // Named wildcard (path-to-regexp v8); the library default '*' logs a legacy-route warning.
      forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      // Integration tests sign in dozens of users from one IP; the rate-limit test opts back in.
      skipIf: () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== 'true',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CoreModule,
  ],
  controllers: [
    HealthController,
    CronController,
    AuthController,
    ProfileController,
    PlansController,
    AdminPlansController,
    MyMembershipsController,
    AdminMembershipsController,
    PaymentsController,
    MyPaymentsController,
    AdminPaymentsController,
    PromotionsController,
    ClassesController,
    MyBookingsController,
    AdminClassesController,
    MyCheckInController,
    AdminCheckInController,
    AdminMembersController,
    TrainersController,
    AdminTrainersController,
    AdminTrainingController,
    MyTrainingController,
    LeadsController,
    StaffController,
    BranchesController,
    ContentController,
    SettingsController,
    AuditController,
    AnalyticsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    AuthService,
    PlansService,
    BookingsService,
    MembershipsService,
    PromotionsService,
    SandboxPaymentProvider,
    PaymentsService,
    ClassesService,
    CheckInService,
    MembersService,
    TrainersService,
    TrainingService,
    LeadsService,
    StaffService,
    AnalyticsService,
    JobsService,
  ],
})
export class AppModule {}
