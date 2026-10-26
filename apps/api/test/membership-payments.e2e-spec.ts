import { addDaysToKey, localDateKey } from '@fitclub/shared';
import { hmac } from '../src/common/crypto';
import { MembershipsService } from '../src/modules/memberships/memberships.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import {
  createSession,
  createUser,
  giveMembership,
  login,
  resetDb,
  seedBase,
  setup,
  type Base,
  type TestContext,
} from './utils';

describe('Memberships, payments & check-in (integration)', () => {
  let ctx: TestContext;
  let base: Base;

  beforeAll(async () => {
    ctx = await setup();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    base = await seedBase(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const today = () => localDateKey(new Date());

  async function member() {
    const u = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
    return { user: u, client: await login(ctx, u.email) };
  }

  describe('purchase → payment → activation', () => {
    it('keeps the membership PENDING until the provider confirms, then activates it with an invoice', async () => {
      const { user, client } = await member();
      const start = await client.post('/api/me/memberships/purchase', { planId: base.plans.unlimited.id });
      expect(start.status).toBe(201);
      expect(start.body.status).toBe('REQUIRES_ACTION');
      expect(start.body.redirectUrl).toContain('/checkout/sandbox?ref=sbx_');

      const pending = await ctx.prisma.membership.findFirstOrThrow({ where: { memberId: user.memberId! } });
      expect(pending.status).toBe('PENDING');
      const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: start.body.paymentId } });
      expect(payment).toMatchObject({ status: 'REQUIRES_ACTION', isTest: true, amount: 30000 });

      // The member portal cannot be used to book with a pending membership.
      const session = await createSession(ctx.prisma, base);
      expect((await client.post('/api/me/bookings', { sessionId: session.id })).body.error.details.reason).toBe(
        'PENDING_PAYMENT',
      );

      const done = await client.post(`/api/payments/sandbox/${payment.providerRef}/simulate`, { outcome: 'success' });
      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({ status: 'SUCCEEDED', membership: { status: 'ACTIVE' } });
      expect(done.body.invoiceNumber).toMatch(/^FC-\d{4}-\d{6}$/);
      expect(await ctx.prisma.membershipEvent.count({ where: { membershipId: pending.id, type: 'ACTIVATED' } })).toBe(
        1,
      );
      expect(await ctx.prisma.notification.count({ where: { userId: user.id, type: 'MEMBERSHIP_ACTIVATED' } })).toBe(1);
    });

    it('processes signed webhooks idempotently and rejects bad signatures or amounts', async () => {
      const { client } = await member();
      const start = await client.post('/api/me/memberships/purchase', { planId: base.plans.unlimited.id });
      const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: start.body.paymentId } });
      const event = {
        eventId: 'evt_replay_1',
        providerRef: payment.providerRef,
        type: 'payment.succeeded',
        amount: payment.amount,
        currency: 'KZT',
      };
      const raw = JSON.stringify(event);
      const sig = hmac(process.env.SANDBOX_WEBHOOK_SECRET!, raw);

      const forged = await ctx
        .http()
        .post('/api/payments/webhooks/sandbox')
        .set('Content-Type', 'application/json')
        .set('X-Sandbox-Signature', 'forged')
        .send(raw);
      expect(forged.status).toBe(400);
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
        'REQUIRES_ACTION',
      );

      const wrongAmount = JSON.stringify({ ...event, eventId: 'evt_amount', amount: 1 });
      const r0 = await ctx
        .http()
        .post('/api/payments/webhooks/sandbox')
        .set('Content-Type', 'application/json')
        .set('X-Sandbox-Signature', hmac(process.env.SANDBOX_WEBHOOK_SECRET!, wrongAmount))
        .send(wrongAmount);
      expect(r0.status).toBe(409);

      const first = await ctx
        .http()
        .post('/api/payments/webhooks/sandbox')
        .set('Content-Type', 'application/json')
        .set('X-Sandbox-Signature', sig)
        .send(raw);
      const replay = await ctx
        .http()
        .post('/api/payments/webhooks/sandbox')
        .set('Content-Type', 'application/json')
        .set('X-Sandbox-Signature', sig)
        .send(raw);
      expect(first.status).toBe(200);
      expect(replay.body).toEqual({ duplicate: true });
      expect(await ctx.prisma.invoice.count()).toBe(1);
      expect(await ctx.prisma.paymentEvent.count({ where: { eventId: 'evt_replay_1' } })).toBe(1);
    });

    it('cancels the pending membership when payment fails', async () => {
      const { user, client } = await member();
      const start = await client.post('/api/me/memberships/purchase', { planId: base.plans.unlimited.id });
      const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: start.body.paymentId } });
      const res = await client.post(`/api/payments/sandbox/${payment.providerRef}/simulate`, { outcome: 'failure' });
      expect(res.body.status).toBe('FAILED');
      expect((await ctx.prisma.membership.findFirstOrThrow({ where: { memberId: user.memberId! } })).status).toBe(
        'CANCELLED',
      );
      expect(await ctx.prisma.invoice.count()).toBe(0);
    });

    it('applies promo codes with limits and records redemptions on capture only', async () => {
      await ctx.prisma.promotion.create({
        data: {
          code: 'TEN',
          name: { kk: 'x', ru: 'x', en: 'x' },
          description: { kk: '', ru: '', en: '' },
          type: 'PERCENT',
          value: 10,
          maxRedemptions: 1,
        },
      });
      const a = await member();
      const quote = await a.client.post('/api/me/memberships/quote', { planId: base.plans.unlimited.id, code: 'TEN' });
      expect(quote.body).toMatchObject({ subtotal: 30000, discount: 3000, total: 27000 });
      const start = await a.client.post('/api/me/memberships/purchase', {
        planId: base.plans.unlimited.id,
        promoCode: 'TEN',
      });
      const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: start.body.paymentId } });
      expect(payment.amount).toBe(27000);
      expect(await ctx.prisma.promotionRedemption.count()).toBe(0);
      await a.client.post(`/api/payments/sandbox/${payment.providerRef}/simulate`, { outcome: 'success' });
      expect(await ctx.prisma.promotionRedemption.count()).toBe(1);

      const b = await member();
      const exhausted = await b.client.post('/api/me/memberships/quote', {
        planId: base.plans.unlimited.id,
        code: 'TEN',
      });
      expect(exhausted.status).toBe(422);
      expect(exhausted.body.error.details.reason).toBe('EXHAUSTED');
    });

    it('records front-desk sales as audited manual payments and preserves the plan snapshot', async () => {
      const m = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const rec = await login(
        ctx,
        (await createUser(ctx.prisma, { role: 'RECEPTIONIST', branchId: base.branchA.id })).email,
      );
      const sale = await rec.post('/api/admin/memberships/sell', {
        memberId: m.memberId,
        planId: base.plans.unlimited.id,
        paymentMethod: 'CASH',
      });
      expect(sale.status).toBe(201);
      expect(sale.body.status).toBe('SUCCEEDED');
      const ms = await ctx.prisma.membership.findFirstOrThrow({ where: { memberId: m.memberId! } });
      expect(ms.status).toBe('ACTIVE');
      const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { membershipId: ms.id } });
      expect(payment).toMatchObject({ provider: 'MANUAL', method: 'CASH', isTest: false });
      expect(await ctx.prisma.auditLog.count({ where: { action: 'membership.sell' } })).toBe(1);

      // Editing the plan later does not rewrite what was sold.
      const admin = await login(ctx, (await createUser(ctx.prisma, { role: 'ADMIN' })).email);
      const plan = await ctx.prisma.membershipPlan.findUniqueOrThrow({ where: { id: base.plans.unlimited.id } });
      const edit = await admin.put(`/api/admin/plans/${plan.id}`, {
        ...plan,
        name: plan.name,
        description: plan.description,
        features: [],
        price: 45000,
        branchIds: [],
      });
      expect(edit.status).toBe(200);
      expect(edit.body.version).toBe(2);
      const after = await ctx.prisma.membership.findUniqueOrThrow({ where: { id: ms.id } });
      expect(after.price).toBe(30000);
      expect((after.planSnapshot as { price?: number }).price).toBe(30000);
    });

    it('refunds are limited to the captured amount and require permission', async () => {
      const m = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const admin = await login(ctx, (await createUser(ctx.prisma, { role: 'ADMIN' })).email);
      await admin.post('/api/admin/memberships/sell', {
        memberId: m.memberId,
        planId: base.plans.unlimited.id,
        paymentMethod: 'CARD_TERMINAL',
      });
      const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { memberId: m.memberId! } });
      expect(
        (await admin.post(`/api/admin/payments/${payment.id}/refunds`, { amount: 10000, reason: 'Partial refund' }))
          .status,
      ).toBe(201);
      const over = await admin.post(`/api/admin/payments/${payment.id}/refunds`, { amount: 25000, reason: 'Too much' });
      expect(over.status).toBe(422);
      expect(over.body.error.details.reason).toBe('EXCEEDS_CAPTURED');
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
        'PARTIALLY_REFUNDED',
      );
    });
  });

  describe('freeze, renewal and expiration', () => {
    it('freezes today (extending the end date), and early unfreeze gives unused days back', async () => {
      const { user, client } = await member();
      const ms = await giveMembership(ctx.prisma, user.memberId!, base.plans.unlimited);
      const res = await client.post(`/api/me/memberships/${ms.id}/freeze`, { startDate: today(), days: 10 });
      expect(res.status).toBe(201);
      const frozen = await ctx.prisma.membership.findUniqueOrThrow({ where: { id: ms.id } });
      expect(frozen.status).toBe('FROZEN');
      expect(frozen.endsAt.getTime() - ms.endsAt.getTime()).toBe(10 * 86_400_000);

      const session = await createSession(ctx.prisma, base);
      expect((await client.post('/api/me/bookings', { sessionId: session.id })).body.error.details.reason).toBe(
        'FROZEN',
      );

      expect((await client.post(`/api/me/memberships/${ms.id}/unfreeze`)).status).toBe(204);
      const back = await ctx.prisma.membership.findUniqueOrThrow({ where: { id: ms.id } });
      expect(back.status).toBe('ACTIVE');
      expect(back.endsAt.getTime() - ms.endsAt.getTime()).toBe(1 * 86_400_000);
      expect(back.frozenDaysUsed).toBe(1);
    });

    it('rejects freezes that break the policy', async () => {
      const { user, client } = await member();
      const ms = await giveMembership(ctx.prisma, user.memberId!, base.plans.unlimited);
      const tooShort = await client.post(`/api/me/memberships/${ms.id}/freeze`, { startDate: today(), days: 3 });
      expect(tooShort.body.error).toMatchObject({ code: 'FREEZE_REJECTED', details: { reason: 'TOO_SHORT' } });
      const tooLong = await client.post(`/api/me/memberships/${ms.id}/freeze`, {
        startDate: addDaysToKey(today(), 1),
        days: 20,
      });
      expect(tooLong.body.error.details.reason).toBe('EXCEEDS_ALLOWANCE');
      const pack = await giveMembership(ctx.prisma, user.memberId!, base.plans.pack);
      expect(
        (await client.post(`/api/me/memberships/${pack.id}/freeze`, { startDate: today(), days: 7 })).body.error.details
          .reason,
      ).toBe('FREEZE_NOT_ALLOWED');
    });

    it('scheduled freezes release booked seats inside the freeze window', async () => {
      const { user, client } = await member();
      const ms = await giveMembership(ctx.prisma, user.memberId!, base.plans.unlimited);
      const session = await createSession(ctx.prisma, base, { hoursFromNow: 50 });
      expect((await client.post('/api/me/bookings', { sessionId: session.id })).status).toBe(201);
      await client.post(`/api/me/memberships/${ms.id}/freeze`, { startDate: addDaysToKey(today(), 1), days: 7 });
      expect((await ctx.prisma.booking.findFirstOrThrow({ where: { sessionId: session.id } })).status).toBe(
        'CANCELLED',
      );
      expect((await ctx.prisma.classSession.findUniqueOrThrow({ where: { id: session.id } })).bookedCount).toBe(0);
    });

    it('renewal extends the end date only after payment succeeds', async () => {
      const { user, client } = await member();
      const ms = await giveMembership(ctx.prisma, user.memberId!, base.plans.unlimited);
      const start = await client.post(`/api/me/memberships/${ms.id}/renew`, {});
      expect(start.status).toBe(201);
      expect((await ctx.prisma.membership.findUniqueOrThrow({ where: { id: ms.id } })).endsAt).toEqual(ms.endsAt);
      const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: start.body.paymentId } });
      await client.post(`/api/payments/sandbox/${payment.providerRef}/simulate`, { outcome: 'success' });
      const renewed = await ctx.prisma.membership.findUniqueOrThrow({ where: { id: ms.id } });
      expect(renewed.endsAt.getTime() - ms.endsAt.getTime()).toBe(30 * 86_400_000);
      expect(await ctx.prisma.membershipEvent.count({ where: { membershipId: ms.id, type: 'RENEWED' } })).toBe(1);
    });

    it('expires memberships past their end date and expires abandoned checkouts', async () => {
      const u = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const ms = await giveMembership(ctx.prisma, u.memberId!, base.plans.unlimited, { startKey: '2025-01-01' });
      const memberships = ctx.app.get(MembershipsService);
      expect(await memberships.expireDue()).toBe(1);
      expect((await ctx.prisma.membership.findUniqueOrThrow({ where: { id: ms.id } })).status).toBe('EXPIRED');

      const { user, client } = await member();
      const start = await client.post('/api/me/memberships/purchase', { planId: base.plans.unlimited.id });
      await ctx.prisma.payment.update({
        where: { id: start.body.paymentId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await ctx.app.get(PaymentsService).expireStale()).toBe(1);
      expect((await ctx.prisma.membership.findFirstOrThrow({ where: { memberId: user.memberId! } })).status).toBe(
        'CANCELLED',
      );
    });
  });

  describe('reception check-in', () => {
    async function reception() {
      return login(ctx, (await createUser(ctx.prisma, { role: 'RECEPTIONIST', branchId: base.branchA.id })).email);
    }

    it('accepts a valid short-lived QR code once per day and counts the visit', async () => {
      const { user, client } = await member();
      const ms = await giveMembership(ctx.prisma, user.memberId!, base.plans.pack);
      const rec = await reception();
      const { token } = (await client.get('/api/me/checkin-token')).body;
      const ok = await rec.post('/api/admin/checkins', { qrToken: token, branchId: base.branchA.id });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ accepted: true, membership: { remainingVisits: 1 } });
      const dup = await rec.post('/api/admin/checkins', { qrToken: token, branchId: base.branchA.id });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('ALREADY_CHECKED_IN');
      expect((await ctx.prisma.membership.findUniqueOrThrow({ where: { id: ms.id } })).visitsUsed).toBe(1);
    });

    it('rejects forged, tampered, expired and revoked QR codes', async () => {
      const { user, client } = await member();
      await giveMembership(ctx.prisma, user.memberId!, base.plans.unlimited);
      const rec = await reception();
      const forged = await rec.post('/api/admin/checkins', {
        qrToken: `FC1.${user.memberId}.${Math.floor(Date.now() / 1000) + 60}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
        branchId: base.branchA.id,
      });
      expect(forged.body.error.code).toBe('QR_INVALID');
      const { token } = (await client.get('/api/me/checkin-token')).body;
      const [p, id, exp, sig] = token.split('.');
      const tampered = await rec.post('/api/admin/checkins', {
        qrToken: [p, id, Number(exp) + 3600, sig].join('.'),
        branchId: base.branchA.id,
      });
      expect(tampered.body.error.code).toBe('QR_INVALID');
      await rec.post(`/api/admin/checkins/revoke-qr/${user.memberId}`);
      expect(
        (await rec.post('/api/admin/checkins', { qrToken: token, branchId: base.branchA.id })).body.error.code,
      ).toBe('QR_INVALID');
    });

    it('records rejected visits, enforces visit limits and branch access, and audits overrides', async () => {
      const rec = await reception();
      const noPlan = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const r1 = await rec.post('/api/admin/checkins', { memberId: noPlan.memberId, branchId: base.branchA.id });
      expect(r1.body).toMatchObject({ accepted: false, reason: 'NO_MEMBERSHIP' });
      expect(await ctx.prisma.checkIn.count({ where: { status: 'REJECTED' } })).toBe(1);

      const used = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      await giveMembership(ctx.prisma, used.memberId!, base.plans.pack, { visitsUsed: 2 });
      expect(
        (await rec.post('/api/admin/checkins', { memberId: used.memberId, branchId: base.branchA.id })).body.reason,
      ).toBe('VISIT_LIMIT_REACHED');

      const gym = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      await giveMembership(ctx.prisma, gym.memberId!, base.plans.gymOnly);
      const recB = await login(
        ctx,
        (await createUser(ctx.prisma, { role: 'RECEPTIONIST', branchId: base.branchB.id })).email,
      );
      expect(
        (await recB.post('/api/admin/checkins', { memberId: gym.memberId, branchId: base.branchB.id })).body.reason,
      ).toBe('BRANCH_NOT_ALLOWED');

      expect(
        (
          await rec.post('/api/admin/checkins/override', {
            memberId: noPlan.memberId,
            branchId: base.branchA.id,
            reason: 'Paying at desk now',
          })
        ).status,
      ).toBe(403);
      const manager = await login(ctx, (await createUser(ctx.prisma, { role: 'MANAGER' })).email);
      const noReason = await manager.post('/api/admin/checkins/override', {
        memberId: noPlan.memberId,
        branchId: base.branchA.id,
        reason: '',
      });
      expect(noReason.status).toBe(400);
      const override = await manager.post('/api/admin/checkins/override', {
        memberId: noPlan.memberId,
        branchId: base.branchA.id,
        reason: 'Paying at desk now',
      });
      expect(override.body.accepted).toBe(true);
      expect(await ctx.prisma.auditLog.count({ where: { action: 'checkin.override' } })).toBe(1);
    });
  });

  describe('analytics', () => {
    it('derives dashboard metrics from database records and hides finance from non-finance roles', async () => {
      const m = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const admin = await login(ctx, (await createUser(ctx.prisma, { role: 'ADMIN' })).email);
      await admin.post('/api/admin/memberships/sell', {
        memberId: m.memberId,
        planId: base.plans.unlimited.id,
        paymentMethod: 'CASH',
      });
      const overview = await admin.get('/api/admin/analytics/overview');
      expect(overview.status).toBe(200);
      expect(overview.body.metrics).toMatchObject({ totalMembers: 1, activeMemberships: 1, newMemberships: 1 });
      expect(overview.body.finance.revenue).toMatchObject({ gross: 30000, net: 30000, payments: 1 });

      const rec = await login(
        ctx,
        (await createUser(ctx.prisma, { role: 'RECEPTIONIST', branchId: base.branchA.id })).email,
      );
      const recView = await rec.get('/api/admin/analytics/overview');
      expect(recView.status).toBe(200);
      expect(recView.body.finance).toBeNull();
    });
  });
});
