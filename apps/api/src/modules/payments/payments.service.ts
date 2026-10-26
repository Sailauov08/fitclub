import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  canTransitionPayment,
  localDateKey,
  nextStatusAfterRefund,
  pickLocale,
  type Locale,
  type LocalizedText,
  type PaymentMethod,
  type PaymentStatus,
} from '@fitclub/shared';
import { Prisma, type MembershipPlan } from '../../generated/prisma/client';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AppError, badRequest, conflict, notFound, unprocessable } from '../../common/errors';
import { randomToken } from '../../common/crypto';
import { localRange } from '../../common/dates';
import { assertBranchAccess, type AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MembershipsService, type PlanSnapshot } from '../memberships/memberships.service';
import { PromotionsService } from '../promotions/promotions.service';
import { SandboxPaymentProvider, type ProviderEvent } from './providers';

const CHECKOUT_TTL_MS = 30 * 60_000;
const planInclude = { branches: { select: { branchId: true } } } as const;
type PlanWithBranches = MembershipPlan & { branches: { branchId: string }[] };

interface PaymentMetadata {
  renewDays?: number;
  renewVisits?: number | null;
  planName?: LocalizedText;
  leadId?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly promotions: PromotionsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly sandbox: SandboxPaymentProvider,
  ) {}

  get providerStatus() {
    return {
      online: this.sandbox.enabled ? 'SANDBOX' : 'NONE',
      sandbox: this.sandbox.enabled,
      liveProviderConfigured: false,
    };
  }

  private async loadPlan(tx: Tx, planId: string, opts: { staff: boolean }): Promise<PlanWithBranches> {
    const plan = await tx.membershipPlan.findUnique({ where: { id: planId }, include: planInclude });
    if (!plan || plan.status !== 'ACTIVE' || (!opts.staff && !plan.isPublic)) {
      throw unprocessable('PLAN_UNAVAILABLE', 'This plan is not available', { reason: 'NOT_AVAILABLE' });
    }
    return plan;
  }

  private async assertTrialAllowed(tx: Tx, memberId: string, plan: MembershipPlan) {
    if (plan.type !== 'TRIAL') return;
    const used = await tx.membership.count({
      where: { memberId, plan: { type: 'TRIAL' }, status: { not: 'CANCELLED' } },
    });
    if (used > 0) throw unprocessable('PLAN_UNAVAILABLE', 'A trial can be used only once', { reason: 'TRIAL_USED' });
  }

  // ───────────── Online checkout (member) ─────────────

  async startPurchase(
    actor: AuthUser,
    memberId: string,
    input: { planId: string; promoCode?: string; startDate?: string },
  ) {
    const result = await this.prisma.transaction(async (tx) => {
      const plan = await this.loadPlan(tx, input.planId, { staff: false });
      if (plan.requiresStudentId) {
        throw unprocessable('PLAN_UNAVAILABLE', 'Student plans are issued at reception after ID verification', {
          reason: 'STUDENT_VERIFICATION',
        });
      }
      await this.assertTrialAllowed(tx, memberId, plan);
      const quote = await this.promotions.quote(tx, memberId, plan, input.promoCode);
      if (quote.total > 0 && !this.sandbox.enabled) {
        throw new AppError(
          'PAYMENT_PROVIDER_UNAVAILABLE',
          HttpStatus.SERVICE_UNAVAILABLE,
          'Online payment is not configured. Please pay at reception.',
        );
      }
      const membership = await this.memberships.createPending(tx, {
        memberId,
        plan,
        startKey: input.startDate,
        soldById: null,
        price: quote.total,
      });
      const payment = await tx.payment.create({
        data: {
          memberId,
          membershipId: membership.id,
          purpose: 'MEMBERSHIP_PURCHASE',
          provider: quote.total === 0 ? 'MANUAL' : 'SANDBOX',
          method: 'ONLINE',
          amount: quote.total,
          subtotal: quote.subtotal,
          discount: quote.discount,
          promotionId: quote.promotion?.id,
          idempotencyKey: randomToken(16),
          isTest: quote.total > 0 && this.sandbox.isTest,
          expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
          metadata: { planName: plan.name } as Prisma.InputJsonValue,
        },
      });
      if (quote.total === 0) {
        // Free trial / 100% promotion: nothing to capture, activate right away.
        const activation = await this.markSucceeded(tx, payment.id, actor.id, { paidAt: new Date() });
        return { payment, plan, redirectUrl: null as string | null, activation };
      }
      return { payment, plan, redirectUrl: null as string | null, activation: null };
    });

    if (result.activation) {
      await this.afterSuccess(result.activation);
      return { paymentId: result.payment.id, status: 'SUCCEEDED' as PaymentStatus, redirectUrl: null };
    }
    const checkout = await this.sandbox.createCheckout({
      paymentId: result.payment.id,
      amount: result.payment.amount,
      currency: 'KZT',
      description: pickLocale(result.plan.name as LocalizedText, actor.locale),
      locale: actor.locale,
    });
    await this.prisma.payment.update({
      where: { id: result.payment.id },
      data: { providerRef: checkout.providerRef, status: 'REQUIRES_ACTION' },
    });
    return {
      paymentId: result.payment.id,
      status: 'REQUIRES_ACTION' as PaymentStatus,
      redirectUrl: checkout.redirectUrl,
    };
  }

  async startRenewal(actor: AuthUser, memberId: string, membershipId: string, promoCode?: string) {
    const created = await this.prisma.transaction(async (tx) => {
      const m = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!m || m.memberId !== memberId) throw notFound('Membership');
      if (m.status !== 'ACTIVE' && m.status !== 'FROZEN')
        throw conflict('MEMBERSHIP_NOT_RENEWABLE', 'Only active or frozen memberships can be renewed');
      const plan = await this.loadPlan(tx, m.planId, { staff: false });
      if (plan.type === 'TRIAL') throw conflict('MEMBERSHIP_NOT_RENEWABLE', 'Trials cannot be renewed');
      if (!this.sandbox.enabled) {
        throw new AppError(
          'PAYMENT_PROVIDER_UNAVAILABLE',
          HttpStatus.SERVICE_UNAVAILABLE,
          'Online payment is not configured. Please pay at reception.',
        );
      }
      const quote = await this.promotions.quote(tx, memberId, plan, promoCode);
      await tx.payment.updateMany({
        where: { membershipId, purpose: 'MEMBERSHIP_RENEWAL', status: { in: ['PENDING', 'REQUIRES_ACTION'] } },
        data: { status: 'CANCELLED' },
      });
      const payment = await tx.payment.create({
        data: {
          memberId,
          membershipId,
          purpose: 'MEMBERSHIP_RENEWAL',
          provider: 'SANDBOX',
          method: 'ONLINE',
          amount: quote.total,
          subtotal: quote.subtotal,
          discount: quote.discount,
          promotionId: quote.promotion?.id,
          idempotencyKey: randomToken(16),
          isTest: this.sandbox.isTest,
          expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
          metadata: {
            renewDays: plan.durationDays,
            renewVisits: plan.visitLimit,
            planName: plan.name,
          } as Prisma.InputJsonValue,
        },
      });
      return { payment, plan };
    });
    const checkout = await this.sandbox.createCheckout({
      paymentId: created.payment.id,
      amount: created.payment.amount,
      currency: 'KZT',
      description: pickLocale(created.plan.name as LocalizedText, actor.locale),
      locale: actor.locale,
    });
    await this.prisma.payment.update({
      where: { id: created.payment.id },
      data: { providerRef: checkout.providerRef, status: 'REQUIRES_ACTION' },
    });
    return {
      paymentId: created.payment.id,
      status: 'REQUIRES_ACTION' as PaymentStatus,
      redirectUrl: checkout.redirectUrl,
    };
  }

  // ───────────── Front-desk sale (staff) ─────────────

  /**
   * Staff sale. Offline methods (cash, card terminal, bank transfer) are real-world payments the
   * staff member confirms they received; they are recorded as SUCCEEDED with the recorder's id
   * and audited. ONLINE creates a sandbox checkout link instead.
   */
  async staffSell(
    actor: AuthUser,
    input: {
      memberId: string;
      planId: string;
      promoCode?: string;
      startDate?: string;
      paymentMethod: PaymentMethod;
      paymentReference?: string;
      leadId?: string;
    },
  ) {
    const member = await this.prisma.member.findUnique({ where: { id: input.memberId } });
    if (!member) throw notFound('Member');
    assertBranchAccess(actor, member.homeBranchId);
    if (input.paymentMethod !== 'ONLINE' && !actor.permissions.includes('payments.record')) {
      throw new AppError(
        'FORBIDDEN',
        HttpStatus.FORBIDDEN,
        'Recording payments requires the payments.record permission',
      );
    }
    if (input.paymentMethod === 'ONLINE' && !this.sandbox.enabled) {
      throw new AppError(
        'PAYMENT_PROVIDER_UNAVAILABLE',
        HttpStatus.SERVICE_UNAVAILABLE,
        'Online payment is not configured',
      );
    }

    const result = await this.prisma.transaction(async (tx) => {
      const plan = await this.loadPlan(tx, input.planId, { staff: true });
      await this.assertTrialAllowed(tx, member.id, plan);
      const quote = await this.promotions.quote(tx, member.id, plan, input.promoCode);
      const membership = await this.memberships.createPending(tx, {
        memberId: member.id,
        plan,
        startKey: input.startDate,
        soldById: actor.id,
        price: quote.total,
      });
      const offline = input.paymentMethod !== 'ONLINE' || quote.total === 0;
      const payment = await tx.payment.create({
        data: {
          memberId: member.id,
          membershipId: membership.id,
          purpose: 'MEMBERSHIP_PURCHASE',
          provider: offline ? 'MANUAL' : 'SANDBOX',
          method: input.paymentMethod,
          amount: quote.total,
          subtotal: quote.subtotal,
          discount: quote.discount,
          promotionId: quote.promotion?.id,
          idempotencyKey: randomToken(16),
          isTest: !offline && this.sandbox.isTest,
          recordedById: offline ? actor.id : null,
          reference: input.paymentReference,
          expiresAt: offline ? null : new Date(Date.now() + CHECKOUT_TTL_MS),
          metadata: { planName: plan.name, leadId: input.leadId } as Prisma.InputJsonValue,
        },
      });
      const activation = offline ? await this.markSucceeded(tx, payment.id, actor.id, { paidAt: new Date() }) : null;
      return { payment, plan, activation };
    });

    await this.audit.log(actor, {
      action: 'membership.sell',
      entityType: 'Payment',
      entityId: result.payment.id,
      branchId: member.homeBranchId,
      metadata: {
        memberId: member.id,
        planCode: result.plan.code,
        amount: result.payment.amount,
        method: input.paymentMethod,
      },
    });
    if (result.activation) {
      await this.afterSuccess(result.activation);
      return { paymentId: result.payment.id, status: 'SUCCEEDED' as PaymentStatus, redirectUrl: null };
    }
    const checkout = await this.sandbox.createCheckout({
      paymentId: result.payment.id,
      amount: result.payment.amount,
      currency: 'KZT',
      description: pickLocale(result.plan.name as LocalizedText, 'ru'),
      locale: 'ru',
    });
    await this.prisma.payment.update({
      where: { id: result.payment.id },
      data: { providerRef: checkout.providerRef, status: 'REQUIRES_ACTION' },
    });
    return {
      paymentId: result.payment.id,
      status: 'REQUIRES_ACTION' as PaymentStatus,
      redirectUrl: checkout.redirectUrl,
    };
  }

  async staffRenew(
    actor: AuthUser,
    membershipId: string,
    input: { paymentMethod: PaymentMethod; paymentReference?: string; promoCode?: string },
  ) {
    if (input.paymentMethod === 'ONLINE')
      throw badRequest('VALIDATION_FAILED', 'Use an offline payment method for front-desk renewals');
    const m = await this.prisma.membership.findUnique({ where: { id: membershipId }, include: { member: true } });
    if (!m) throw notFound('Membership');
    assertBranchAccess(actor, m.member.homeBranchId);
    const activation = await this.prisma.transaction(async (tx) => {
      const plan = await this.loadPlan(tx, m.planId, { staff: true });
      if (plan.type === 'TRIAL') throw conflict('MEMBERSHIP_NOT_RENEWABLE', 'Trials cannot be renewed');
      const quote = await this.promotions.quote(tx, m.memberId, plan, input.promoCode);
      const payment = await tx.payment.create({
        data: {
          memberId: m.memberId,
          membershipId,
          purpose: 'MEMBERSHIP_RENEWAL',
          provider: 'MANUAL',
          method: input.paymentMethod,
          amount: quote.total,
          subtotal: quote.subtotal,
          discount: quote.discount,
          promotionId: quote.promotion?.id,
          idempotencyKey: randomToken(16),
          recordedById: actor.id,
          reference: input.paymentReference,
          metadata: {
            renewDays: plan.durationDays,
            renewVisits: plan.visitLimit,
            planName: plan.name,
          } as Prisma.InputJsonValue,
        },
      });
      return this.markSucceeded(tx, payment.id, actor.id, { paidAt: new Date() });
    });
    await this.audit.log(actor, {
      action: 'membership.renew',
      entityType: 'Membership',
      entityId: membershipId,
      metadata: { method: input.paymentMethod },
    });
    await this.afterSuccess(activation);
    return { status: 'SUCCEEDED' };
  }

  // ───────────── State changes ─────────────

  /**
   * The only path to SUCCEEDED. Locks the payment row, checks the state machine,
   * applies the purchase/renewal, issues the invoice and redeems the promotion — atomically.
   */
  private async markSucceeded(
    tx: Tx,
    paymentId: string,
    actorId: string | null,
    opts: { paidAt: Date; capturedAmount?: number },
  ) {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status === 'SUCCEEDED') return null; // idempotent
    if (!canTransitionPayment(payment.status, 'SUCCEEDED')) {
      throw conflict('PAYMENT_STATE_INVALID', `Payment cannot succeed from ${payment.status}`);
    }
    if (opts.capturedAmount !== undefined && opts.capturedAmount !== payment.amount) {
      throw conflict('PAYMENT_STATE_INVALID', 'Captured amount does not match the order amount');
    }
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'SUCCEEDED', paidAt: opts.paidAt, failureReason: null },
    });

    const meta = (payment.metadata ?? {}) as PaymentMetadata;
    let activation: { userId: string; planName: LocalizedText; endsAt: Date; renewed: boolean } | null = null;
    if (payment.membershipId && payment.purpose === 'MEMBERSHIP_PURCHASE') {
      const r = await this.memberships.activate(tx, payment.membershipId, actorId);
      activation = { ...r, renewed: false };
    } else if (payment.membershipId && payment.purpose === 'MEMBERSHIP_RENEWAL') {
      const r = await this.memberships.applyRenewal(tx, payment.membershipId, actorId, {
        days: meta.renewDays ?? 30,
        visits: meta.renewVisits ?? null,
        paymentId,
      });
      activation = { ...r, renewed: true };
    }

    const planName =
      meta.planName ??
      (
        (await tx.membership.findUnique({ where: { id: payment.membershipId ?? '' } }))?.planSnapshot as unknown as
          | PlanSnapshot
          | undefined
      )?.name;
    const invoice = await tx.invoice.create({
      data: {
        number: `TMP-${payment.id}`,
        paymentId,
        memberId: payment.memberId,
        items: [
          { description: planName ?? null, purpose: payment.purpose, quantity: 1, unitPrice: payment.subtotal },
        ] as Prisma.InputJsonValue,
        subtotal: payment.subtotal,
        discount: payment.discount,
        total: payment.amount,
        issuedAt: opts.paidAt,
      },
    });
    const number = `FC-${opts.paidAt.getUTCFullYear()}-${String(invoice.seq).padStart(6, '0')}`;
    await tx.invoice.update({ where: { id: invoice.id }, data: { number } });

    if (payment.promotionId && payment.discount > 0) {
      const ok = await this.promotions.redeem(tx, payment.promotionId, payment.memberId, payment.id, payment.discount);
      if (!ok) this.logger.warn({ paymentId }, 'Promotion limit reached during capture; honouring the paid price');
    }
    if (meta.leadId) {
      await tx.lead.updateMany({
        where: { id: meta.leadId, convertedAt: null },
        data: { status: 'WON', convertedMemberId: payment.memberId, convertedAt: new Date() },
      });
    }
    const member = await tx.member.findUniqueOrThrow({ where: { id: payment.memberId }, select: { userId: true } });
    return { activation, userId: member.userId, amount: payment.amount, invoiceNumber: number };
  }

  private async afterSuccess(result: Awaited<ReturnType<PaymentsService['markSucceeded']>>) {
    if (!result) return;
    await this.notifications.notify(result.userId, 'PAYMENT_SUCCEEDED', {
      amount: result.amount,
      invoiceNumber: result.invoiceNumber,
    });
    if (result.activation) {
      if (result.activation.renewed) {
        await this.notifications.notify(result.userId, 'MEMBERSHIP_EXTENDED', {
          planName: result.activation.planName,
          endsOn: localDateKey(new Date(result.activation.endsAt.getTime() - 1)),
        });
      } else {
        await this.memberships.notifyActivated(result.activation);
      }
    }
  }

  private async markFailed(tx: Tx, paymentId: string, status: 'FAILED' | 'CANCELLED' | 'EXPIRED', reason: string) {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status === status) return null;
    if (!canTransitionPayment(payment.status, status))
      throw conflict('PAYMENT_STATE_INVALID', `Payment cannot move from ${payment.status} to ${status}`);
    await tx.payment.update({ where: { id: paymentId }, data: { status, failureReason: reason } });
    if (payment.membershipId && payment.purpose === 'MEMBERSHIP_PURCHASE') {
      await this.memberships.abandonPending(tx, payment.membershipId, `Payment ${status.toLowerCase()}`);
    }
    return payment;
  }

  /**
   * Idempotent provider event processing: each (provider, eventId) is stored once;
   * replays of an already processed event are acknowledged without side effects.
   */
  async handleProviderEvent(provider: 'SANDBOX', event: ProviderEvent, rawPayload: unknown) {
    let record;
    try {
      record = await this.prisma.paymentEvent.create({
        data: { provider, eventId: event.eventId, type: event.type, payload: rawPayload as Prisma.InputJsonValue },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const existing = await this.prisma.paymentEvent.findUnique({
          where: { provider_eventId: { provider, eventId: event.eventId } },
        });
        if (existing?.processedAt) return { duplicate: true };
        record = existing!;
      } else throw error;
    }

    const payment = await this.prisma.payment.findUnique({ where: { providerRef: event.providerRef } });
    if (!payment) {
      await this.prisma.paymentEvent.update({
        where: { id: record.id },
        data: { error: 'Unknown payment reference', processedAt: new Date() },
      });
      throw notFound('Payment');
    }
    try {
      if (event.type === 'payment.succeeded') {
        if (event.currency !== payment.currency) throw conflict('PAYMENT_STATE_INVALID', 'Currency mismatch');
        const result = await this.prisma.transaction((tx) =>
          this.markSucceeded(tx, payment.id, null, { paidAt: new Date(), capturedAmount: event.amount }),
        );
        await this.afterSuccess(result);
      } else {
        const status = event.type === 'payment.cancelled' ? 'CANCELLED' : 'FAILED';
        const failed = await this.prisma.transaction((tx) =>
          this.markFailed(tx, payment.id, status, event.failureReason ?? status),
        );
        if (failed) {
          const member = await this.prisma.member.findUnique({ where: { id: payment.memberId } });
          if (member) await this.notifications.notify(member.userId, 'PAYMENT_FAILED', { amount: payment.amount });
        }
      }
      await this.prisma.paymentEvent.update({
        where: { id: record.id },
        data: { processedAt: new Date(), paymentId: payment.id, error: null },
      });
      return { duplicate: false };
    } catch (error) {
      await this.prisma.paymentEvent.update({
        where: { id: record.id },
        data: { paymentId: payment.id, error: String((error as Error).message).slice(0, 500) },
      });
      throw error;
    }
  }

  /** Sandbox-only: simulates the provider calling our webhook with a correctly signed event. */
  async simulateSandbox(actor: AuthUser, providerRef: string, outcome: 'success' | 'failure' | 'cancel') {
    if (!this.sandbox.enabled)
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', HttpStatus.NOT_FOUND, 'Sandbox payments are disabled');
    const payment = await this.prisma.payment.findUnique({ where: { providerRef } });
    if (!payment || (payment.memberId !== actor.memberId && !actor.permissions.includes('payments.record')))
      throw notFound('Payment');
    const event: ProviderEvent = {
      eventId: `evt_${randomToken(12)}`,
      providerRef,
      type: outcome === 'success' ? 'payment.succeeded' : outcome === 'cancel' ? 'payment.cancelled' : 'payment.failed',
      amount: payment.amount,
      currency: payment.currency,
      failureReason: outcome === 'failure' ? 'Sandbox: card declined (simulated)' : undefined,
    };
    const raw = JSON.stringify(event);
    const parsed = this.sandbox.parseWebhook(raw, this.sandbox.sign(raw));
    await this.handleProviderEvent('SANDBOX', parsed, event);
    return this.checkoutStatus(actor, payment.id);
  }

  async sandboxCheckout(actor: AuthUser, providerRef: string) {
    if (!this.sandbox.enabled) throw notFound('Payment');
    const payment = await this.prisma.payment.findUnique({ where: { providerRef } });
    if (!payment || (payment.memberId !== actor.memberId && !actor.permissions.includes('payments.record')))
      throw notFound('Payment');
    const meta = (payment.metadata ?? {}) as PaymentMetadata;
    return {
      providerRef,
      paymentId: payment.id,
      amount: payment.amount,
      subtotal: payment.subtotal,
      discount: payment.discount,
      currency: payment.currency,
      status: payment.status,
      purpose: payment.purpose,
      planName: meta.planName ?? null,
      expiresAt: payment.expiresAt,
    };
  }

  async checkoutStatus(actor: AuthUser, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: true, membership: true },
    });
    if (!payment || (payment.memberId !== actor.memberId && !actor.permissions.includes('payments.read')))
      throw notFound('Payment');
    return {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      isTest: payment.isTest,
      invoiceNumber: payment.invoice?.number ?? null,
      membership: payment.membership
        ? { id: payment.membership.id, status: payment.membership.status, endsAt: payment.membership.endsAt }
        : null,
    };
  }

  /** Job: abandoned checkouts expire and release their pending membership. */
  async expireStale(now = new Date()) {
    const stale = await this.prisma.payment.findMany({
      where: { status: { in: ['PENDING', 'REQUIRES_ACTION'] }, expiresAt: { lt: now } },
      select: { id: true },
    });
    for (const p of stale) {
      await this.prisma
        .transaction((tx) => this.markFailed(tx, p.id, 'EXPIRED', 'Checkout expired'))
        .catch((error) => this.logger.warn({ err: error, paymentId: p.id }, 'Could not expire payment'));
    }
    return stale.length;
  }

  // ───────────── Refunds & reconciliation ─────────────

  async refund(
    actor: AuthUser,
    paymentId: string,
    input: { amount: number; reason: string; cancelMembership?: boolean },
  ) {
    const outcome = await this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { member: true } });
      if (!payment) throw notFound('Payment');
      assertBranchAccess(actor, payment.member.homeBranchId);
      const refunded = await tx.refund.aggregate({ where: { paymentId, status: 'SUCCEEDED' }, _sum: { amount: true } });
      const decision = nextStatusAfterRefund(payment, refunded._sum.amount ?? 0, input.amount);
      if (!decision.ok) throw unprocessable('REFUND_REJECTED', 'Refund rejected', { reason: decision.reason });
      const refund = await tx.refund.create({
        data: { paymentId, amount: input.amount, reason: input.reason, createdById: actor.id },
      });
      await tx.payment.update({ where: { id: paymentId }, data: { status: decision.status } });
      return { refund, payment };
    });
    await this.audit.log(actor, {
      action: 'payment.refund',
      entityType: 'Payment',
      entityId: paymentId,
      metadata: {
        amount: input.amount,
        reason: input.reason,
        method: outcome.payment.method,
        isTest: outcome.payment.isTest,
      },
    });
    if (input.cancelMembership && outcome.payment.membershipId) {
      await this.memberships.cancel(actor, outcome.payment.membershipId, `Refunded: ${input.reason}`).catch((error) => {
        if (!(error instanceof AppError)) throw error;
      });
    }
    await this.notifications.notify(outcome.payment.member.userId, 'PAYMENT_REFUNDED', { amount: input.amount });
    return outcome.refund;
  }

  async reconcile(
    actor: AuthUser,
    paymentId: string,
    status: 'UNRECONCILED' | 'MATCHED' | 'DISCREPANCY',
    note?: string,
  ) {
    const payment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { reconciliationStatus: status, reconciliationNote: note ?? null },
    });
    await this.audit.log(actor, {
      action: 'payment.reconcile',
      entityType: 'Payment',
      entityId: paymentId,
      metadata: { status },
    });
    return payment;
  }

  // ───────────── Queries ─────────────

  async list(
    actor: AuthUser,
    q: {
      page: number;
      pageSize: number;
      q?: string;
      status?: string;
      method?: PaymentMethod;
      reconciliation?: 'UNRECONCILED' | 'MATCHED' | 'DISCREPANCY';
      from?: string;
      to?: string;
      includeTest?: boolean;
    },
  ) {
    const where: Prisma.PaymentWhereInput = {
      ...(q.status ? { status: q.status as PaymentStatus } : {}),
      ...(q.method ? { method: q.method } : {}),
      ...(q.reconciliation ? { reconciliationStatus: q.reconciliation } : {}),
      ...(q.includeTest === false ? { isTest: false } : {}),
      ...(q.from && q.to ? { createdAt: localRange(q.from, q.to) } : {}),
      ...(actor.staffBranchId ? { member: { homeBranchId: actor.staffBranchId } } : {}),
      ...(q.q
        ? {
            OR: [
              { member: { user: { email: { contains: q.q, mode: 'insensitive' } } } },
              { member: { user: { profile: { lastName: { contains: q.q, mode: 'insensitive' } } } } },
              { invoice: { number: { contains: q.q, mode: 'insensitive' } } },
              { reference: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total, sums] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          member: {
            select: {
              id: true,
              memberNumber: true,
              user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
            },
          },
          invoice: { select: { number: true } },
          refunds: { select: { amount: true } },
        },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({
        where: { ...where, status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);
    return {
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      summary: { capturedAmount: sums._sum.amount ?? 0, capturedCount: sums._count },
    };
  }

  async get(actor: AuthUser, id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        member: {
          select: {
            id: true,
            memberNumber: true,
            homeBranchId: true,
            user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
          },
        },
        invoice: true,
        refunds: { orderBy: { createdAt: 'desc' } },
        events: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, type: true, eventId: true, processedAt: true, error: true, createdAt: true },
        },
        membership: { select: { id: true, status: true, planSnapshot: true } },
        promotion: { select: { code: true, name: true } },
      },
    });
    if (!payment) throw notFound('Payment');
    assertBranchAccess(actor, payment.member.homeBranchId);
    return payment;
  }

  async memberPayments(memberId: string) {
    return this.prisma.payment.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        purpose: true,
        method: true,
        status: true,
        amount: true,
        subtotal: true,
        discount: true,
        isTest: true,
        paidAt: true,
        createdAt: true,
        providerRef: true,
        invoice: { select: { id: true, number: true } },
        refunds: { select: { amount: true, createdAt: true } },
        metadata: true,
      },
    });
  }

  async invoice(actor: AuthUser, invoiceId: string, locale: Locale) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        payment: { include: { refunds: true } },
        member: {
          select: {
            id: true,
            memberNumber: true,
            homeBranchId: true,
            user: { select: { email: true, profile: { select: { firstName: true, lastName: true, phone: true } } } },
          },
        },
      },
    });
    const isOwner = invoice && invoice.memberId === actor.memberId;
    if (!invoice || (!isOwner && !actor.permissions.includes('payments.read'))) throw notFound('Invoice');
    if (!isOwner) assertBranchAccess(actor, invoice.member.homeBranchId);
    return { ...invoice, locale };
  }
}
