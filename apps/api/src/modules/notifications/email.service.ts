import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailOnlyType, Locale, NotificationType } from '@fitclub/shared';
import { emailConfigured, env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { renderNotification } from './render';

export interface EmailProvider {
  readonly name: string;
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

class SmtpProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transport: Transporter;

  constructor() {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }

  async send(message: { to: string; subject: string; text: string }) {
    await this.transport.sendMail({ from: env.EMAIL_FROM, ...message });
  }
}

/**
 * Transactional e-mail via an outbox table. Without SMTP credentials messages are kept
 * with status SKIPPED (visible in Settings → Notifications) — nothing pretends to be sent.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');
  private readonly provider: EmailProvider | null = emailConfigured ? new SmtpProvider() : null;

  constructor(private readonly prisma: PrismaService) {}

  get status() {
    return { configured: Boolean(this.provider), provider: this.provider?.name ?? 'none', from: env.EMAIL_FROM };
  }

  async send(to: string, type: NotificationType | EmailOnlyType, locale: Locale, data: Record<string, unknown>) {
    const { title, body } = renderNotification(type, locale, data);
    const text = `${body}\n\n— FITCLUB`;
    const message = await this.prisma.emailMessage.create({ data: { to, subject: title, text, type } });
    if (env.EMAIL_DEV_LOG) {
      this.logger.log(`[dev e-mail] to=${to} subject="${title}"\n${text}`);
    }
    await this.deliver(message.id);
  }

  async deliver(id: string) {
    const message = await this.prisma.emailMessage.findUnique({ where: { id } });
    if (!message || message.status === 'SENT') return;
    if (!this.provider) {
      await this.prisma.emailMessage.update({
        where: { id },
        data: { status: 'SKIPPED', error: 'E-mail delivery is not configured (SMTP_HOST is empty)' },
      });
      return;
    }
    try {
      await this.provider.send({ to: message.to, subject: message.subject, text: message.text });
      await this.prisma.emailMessage.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, error: null },
      });
    } catch (error) {
      this.logger.warn({ err: error, id }, 'E-mail delivery failed');
      await this.prisma.emailMessage.update({
        where: { id },
        data: { status: 'FAILED', attempts: { increment: 1 }, error: String((error as Error).message).slice(0, 500) },
      });
    }
  }

  /** Retries failed messages (called by the jobs module). */
  async retryFailed() {
    if (!this.provider) return 0;
    const failed = await this.prisma.emailMessage.findMany({
      where: { status: 'FAILED', attempts: { lt: 5 } },
      take: 50,
    });
    for (const m of failed) await this.deliver(m.id);
    return failed.length;
  }
}
