import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_NOTIFICATION_PREFS,
  isLocale,
  NOTIFICATION_CATEGORY,
  notificationPrefsSchema,
  type NotificationPrefs,
  type NotificationType,
} from '@fitclub/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { renderNotification } from './render';

export function parsePrefs(value: unknown): NotificationPrefs {
  const parsed = notificationPrefsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_PREFS;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Creates an in-app notification and/or e-mail according to the user's preferences.
   * `dedupeKey` makes scheduled reminders idempotent. Never throws: a notification failure
   * must not roll back the business operation that triggered it.
   */
  async notify(
    userId: string,
    type: NotificationType,
    data: Record<string, unknown>,
    opts: { dedupeKey?: string } = {},
  ) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
      if (!user || user.deletedAt) return;
      const category = NOTIFICATION_CATEGORY[type];
      const prefs = parsePrefs(user.profile?.notificationPrefs);
      const channel = category === 'system' ? { inApp: true, email: false } : prefs[category];
      if (channel.inApp) {
        try {
          await this.prisma.notification.create({
            data: { userId, type, data: data as Prisma.InputJsonValue, dedupeKey: opts.dedupeKey },
          });
        } catch (error) {
          if ((error as { code?: string }).code === 'P2002') return; // already delivered
          throw error;
        }
      }
      if (channel.email) {
        const locale = isLocale(user.locale) ? user.locale : 'ru';
        await this.email.send(user.email, type, locale, data);
      }
    } catch (error) {
      this.logger.error({ err: error, type, userId }, 'Notification failed');
    }
  }

  async notifyStaff(
    permissionRoles: ('OWNER' | 'ADMIN' | 'MANAGER')[],
    type: NotificationType,
    data: Record<string, unknown>,
  ) {
    const staff = await this.prisma.staffMember.findMany({
      where: { role: { in: permissionRoles }, status: 'ACTIVE' },
      select: { userId: true },
    });
    await Promise.all(staff.map((s) => this.notify(s.userId, type, data)));
  }

  async list(userId: string, locale: 'kk' | 'ru' | 'en', opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: Math.min(opts.limit ?? 30, 100),
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      unread,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        readAt: n.readAt,
        createdAt: n.createdAt,
        data: n.data,
        ...renderNotification(n.type as NotificationType, locale, (n.data ?? {}) as Record<string, unknown>),
      })),
    };
  }

  async markRead(userId: string, ids: string[] | 'all') {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
  }
}
