import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { LocalizedText } from '@fitclub/shared';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipsService } from '../memberships/memberships.service';
import { PaymentsService } from '../payments/payments.service';
import { ClassesService } from '../classes/classes.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { SettingsService } from '../settings/settings.service';

/** Stable 32-bit key per job name for pg advisory locks. */
function lockKey(name: string): number {
  let h = 0;
  for (const c of name) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return h;
}

/**
 * Scheduled maintenance. Each job takes a PostgreSQL advisory lock so that only one API
 * instance runs it at a time; all jobs are idempotent and safe to re-run.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Jobs');

  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly payments: PaymentsService,
    private readonly classes: ClassesService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly settings: SettingsService,
  ) {}

  async onApplicationBootstrap() {
    if (!env.JOBS_ENABLED) return;
    // Catch up after downtime.
    setTimeout(() => void this.membershipMaintenance(), 3_000);
    setTimeout(() => void this.generateSessions(), 5_000);
  }

  /** Set while an external scheduler (Vercel Cron) drives the jobs: no in-process gate or lock. */
  private external = false;

  private async exclusive<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (this.external) return this.record(name, fn);
    if (!env.JOBS_ENABLED) return undefined;
    const key = lockKey(name);
    const [row] = await this.prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${key}) AS locked`;
    if (!row?.locked) return undefined;
    try {
      return await this.record(name, fn);
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${key})`;
    }
  }

  private async record<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await fn();
      await this.prisma.jobRun.upsert({
        where: { name },
        create: { name, lastRunAt: new Date(), lastResult: result as never },
        update: { lastRunAt: new Date(), lastResult: result as never },
      });
      return result;
    } catch (error) {
      this.logger.error({ err: error, job: name }, 'Job failed');
      return undefined;
    }
  }

  /**
   * Runs every job once, in dependency order. Called by Vercel Cron, which on the Hobby plan fires at
   * most daily. Session-level advisory locks are skipped because a transaction-mode connection pooler
   * (Neon) cannot hold them; every job is idempotent and the platform runs one invocation per schedule.
   */
  async runAll() {
    this.external = true;
    try {
      return {
        membershipMaintenance: await this.membershipMaintenance(),
        completeSessions: await this.completeSessions(),
        generateSessions: await this.generateSessions(),
        expiryReminders: await this.expiryReminders(),
        classReminders: await this.classReminders(),
        retryEmails: await this.retryEmails(),
        cleanup: await this.cleanup(),
      };
    } finally {
      this.external = false;
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  membershipMaintenance() {
    return this.exclusive('membership-maintenance', async () => ({
      freezes: await this.memberships.processFreezes(),
      expired: await this.memberships.expireDue(),
      stalePayments: await this.payments.expireStale(),
    }));
  }

  @Cron('0 0 10 * * *', { timeZone: 'Asia/Almaty' })
  expiryReminders() {
    return this.exclusive('expiry-reminders', async () => ({ sent: await this.memberships.sendExpiryReminders() }));
  }

  @Cron(CronExpression.EVERY_HOUR)
  generateSessions() {
    return this.exclusive('generate-sessions', async () => ({ created: await this.classes.generateSessions() }));
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  completeSessions() {
    return this.exclusive('complete-sessions', async () => ({ completed: await this.classes.completePastSessions() }));
  }

  /** Reminds booked members N hours before class (N from settings). Dedupe key makes it send once. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  classReminders() {
    return this.exclusive('class-reminders', async () => {
      const { notifications } = await this.settings.get();
      const now = new Date();
      const horizon = new Date(now.getTime() + notifications.classReminderHours * 3_600_000);
      const sessions = await this.prisma.classSession.findMany({
        where: { status: 'SCHEDULED', reminderSentAt: null, startsAt: { gt: now, lte: horizon } },
        include: {
          classType: { select: { name: true } },
          room: { select: { name: true } },
          bookings: { where: { status: 'CONFIRMED' }, select: { id: true, member: { select: { userId: true } } } },
        },
      });
      let sent = 0;
      for (const s of sessions) {
        for (const b of s.bookings) {
          await this.notifications.notify(
            b.member.userId,
            'CLASS_REMINDER',
            {
              className: s.classType.name as LocalizedText,
              when: s.startsAt.toISOString(),
              room: s.room.name as LocalizedText,
            },
            { dedupeKey: `reminder:${b.id}` },
          );
          sent += 1;
        }
        await this.prisma.classSession.update({ where: { id: s.id }, data: { reminderSentAt: now } });
      }
      return { sessions: sessions.length, sent };
    });
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  retryEmails() {
    return this.exclusive('retry-emails', async () => ({ retried: await this.email.retryFailed() }));
  }

  @Cron('0 30 3 * * *', { timeZone: 'Asia/Almaty' })
  cleanup() {
    return this.exclusive('cleanup', async () => {
      const cutoff = new Date(Date.now() - 30 * 86_400_000);
      const sessions = await this.prisma.session.deleteMany({
        where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
      });
      const tokens = await this.prisma.authToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
      return { sessions: sessions.count, tokens: tokens.count };
    });
  }
}
