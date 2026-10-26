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

describe('Class booking engine (integration)', () => {
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

  async function memberWithPlan(plan = base.plans.unlimited) {
    const u = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
    await giveMembership(ctx.prisma, u.memberId!, plan);
    return { user: u, client: await login(ctx, u.email) };
  }

  it('never oversells a class under concurrent booking attempts', async () => {
    const session = await createSession(ctx.prisma, base, { capacity: 5 });
    const members = await Promise.all(Array.from({ length: 15 }, () => memberWithPlan()));
    const results = await Promise.all(members.map((m) => m.client.post('/api/me/bookings', { sessionId: session.id })));
    const ok = results.filter((r) => r.status === 201);
    const full = results.filter((r) => r.status === 409 && r.body.error.details?.reason === 'SESSION_FULL');
    expect(ok).toHaveLength(5);
    expect(full).toHaveLength(10);
    const fresh = await ctx.prisma.classSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(fresh.bookedCount).toBe(5);
    expect(await ctx.prisma.booking.count({ where: { sessionId: session.id, status: 'CONFIRMED' } })).toBe(5);
  });

  it('prevents double booking by the same member, even concurrently', async () => {
    const session = await createSession(ctx.prisma, base, { capacity: 10 });
    const { client } = await memberWithPlan();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => client.post('/api/me/bookings', { sessionId: session.id })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(
      results.filter((r) => r.status === 201).length +
        results.filter((r) => r.body.error?.details?.reason === 'ALREADY_BOOKED').length,
    ).toBe(6);
    expect((await ctx.prisma.classSession.findUniqueOrThrow({ where: { id: session.id } })).bookedCount).toBe(1);
  });

  it('checks eligibility server-side', async () => {
    const session = await createSession(ctx.prisma, base);
    const noPlan = await login(ctx, (await createUser(ctx.prisma, { member: { branchId: base.branchA.id } })).email);
    const r1 = await noPlan.post('/api/me/bookings', { sessionId: session.id });
    expect(r1.status).toBe(403);
    expect(r1.body.error).toMatchObject({ code: 'NOT_ELIGIBLE', details: { reason: 'NO_MEMBERSHIP' } });

    const gym = await memberWithPlan(base.plans.gymOnly);
    const r2 = await gym.client.post('/api/me/bookings', { sessionId: session.id });
    expect(r2.body.error.details.reason).toBe('CLASSES_NOT_INCLUDED');

    const expiredUser = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
    await giveMembership(ctx.prisma, expiredUser.memberId!, base.plans.unlimited, {
      status: 'EXPIRED',
      startKey: '2025-01-01',
    });
    const r3 = await (await login(ctx, expiredUser.email)).post('/api/me/bookings', { sessionId: session.id });
    expect(r3.body.error.code).toBe('NOT_ELIGIBLE');
  });

  it('enforces booking window, cut-off and time conflicts', async () => {
    const { client } = await memberWithPlan();
    const tooFar = await createSession(ctx.prisma, base, { hoursFromNow: 24 * 10 });
    expect((await client.post('/api/me/bookings', { sessionId: tooFar.id })).body.error.details.reason).toBe(
      'BOOKING_NOT_OPEN',
    );
    const tooSoon = await createSession(ctx.prisma, base, { hoursFromNow: 0.2 });
    expect((await client.post('/api/me/bookings', { sessionId: tooSoon.id })).body.error.details.reason).toBe(
      'BOOKING_CLOSED',
    );

    const first = await createSession(ctx.prisma, base, { hoursFromNow: 30 });
    const overlapping = await createSession(ctx.prisma, base, { hoursFromNow: 30.25 });
    expect((await client.post('/api/me/bookings', { sessionId: first.id })).status).toBe(201);
    expect((await client.post('/api/me/bookings', { sessionId: overlapping.id })).body.error.details.reason).toBe(
      'TIME_CONFLICT',
    );
  });

  it('cancels, flags late cancellations, and promotes the waitlist automatically', async () => {
    const session = await createSession(ctx.prisma, base, { capacity: 1, hoursFromNow: 3 });
    const a = await memberWithPlan();
    const b = await memberWithPlan();
    const booking = await a.client.post('/api/me/bookings', { sessionId: session.id });
    expect(booking.status).toBe(201);
    expect((await b.client.post('/api/me/bookings', { sessionId: session.id })).body.error.details.reason).toBe(
      'SESSION_FULL',
    );
    const wait = await b.client.post('/api/me/waitlist', { sessionId: session.id });
    expect(wait.status).toBe(201);
    expect(wait.body.position).toBe(1);

    // Another member cannot cancel A's booking.
    expect((await b.client.post(`/api/me/bookings/${booking.body.id}/cancel`)).status).toBe(404);

    const cancel = await a.client.post(`/api/me/bookings/${booking.body.id}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body).toEqual({ status: 'LATE_CANCELLED', late: true });

    const promoted = await ctx.prisma.booking.findFirstOrThrow({
      where: { sessionId: session.id, memberId: b.user.memberId! },
    });
    expect(promoted).toMatchObject({ status: 'CONFIRMED', fromWaitlist: true });
    expect((await ctx.prisma.waitlistEntry.findFirstOrThrow({ where: { sessionId: session.id } })).status).toBe(
      'PROMOTED',
    );
    expect((await ctx.prisma.classSession.findUniqueOrThrow({ where: { id: session.id } })).bookedCount).toBe(1);
    expect(await ctx.prisma.notification.count({ where: { userId: b.user.id, type: 'WAITLIST_PROMOTED' } })).toBe(1);

    // Re-booking after cancellation reuses the row (unique constraint) and works when a seat frees up.
    const b2 = await b.client.get('/api/me/bookings');
    expect(b2.body.bookings).toHaveLength(1);
  });

  it('staff cancel sessions (notifying members) and trainers mark attendance only for their own classes', async () => {
    const trainerUser = await createUser(ctx.prisma, { role: 'TRAINER', branchId: base.branchA.id });
    const trainer = await ctx.prisma.trainer.create({
      data: {
        slug: 'own',
        userId: trainerUser.id,
        branchId: base.branchA.id,
        displayName: 'Own',
        headline: { kk: '', ru: '', en: '' },
        bio: { kk: '', ru: '', en: '' },
        specializations: [],
        certifications: [],
      },
    });
    const mine = await createSession(ctx.prisma, base, { trainerId: trainer.id, hoursFromNow: 1 });
    const other = await createSession(ctx.prisma, base, { hoursFromNow: 1 });
    const m = await memberWithPlan();
    const bMine = await m.client.post('/api/me/bookings', { sessionId: mine.id });
    const other2 = await memberWithPlan();
    const bOther = await other2.client.post('/api/me/bookings', { sessionId: other.id });
    await ctx.prisma.classSession.updateMany({ data: { startsAt: new Date(Date.now() - 10 * 60_000) } });

    const trainerClient = await login(ctx, trainerUser.email);
    expect(
      (await trainerClient.put(`/api/admin/bookings/${bMine.body.id}/attendance`, { status: 'ATTENDED' })).status,
    ).toBe(200);
    expect(
      (await trainerClient.put(`/api/admin/bookings/${bOther.body.id}/attendance`, { status: 'ATTENDED' })).status,
    ).toBe(403);

    const manager = await login(ctx, (await createUser(ctx.prisma, { role: 'MANAGER' })).email);
    const third = await createSession(ctx.prisma, base, { hoursFromNow: 48 });
    const m3 = await memberWithPlan();
    await m3.client.post('/api/me/bookings', { sessionId: third.id });
    const cancelled = await manager.post(`/api/admin/sessions/${third.id}/cancel`, { reason: 'Coach is ill' });
    expect(cancelled.body).toEqual({ affected: 1 });
    expect((await ctx.prisma.booking.findFirstOrThrow({ where: { sessionId: third.id } })).status).toBe('CANCELLED');
    expect(await ctx.prisma.notification.count({ where: { userId: m3.user.id, type: 'SESSION_CANCELLED' } })).toBe(1);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'session.cancel' } })).toBe(1);
  });

  it('detects room and trainer conflicts when scheduling', async () => {
    const manager = await login(ctx, (await createUser(ctx.prisma, { role: 'MANAGER' })).email);
    const trainer = await ctx.prisma.trainer.create({
      data: {
        slug: 'coach-x',
        branchId: base.branchA.id,
        displayName: 'X',
        headline: { kk: '', ru: '', en: '' },
        bio: { kk: '', ru: '', en: '' },
        specializations: [],
        certifications: [],
      },
    });
    const body = {
      classTypeId: base.classType.id,
      trainerId: trainer.id,
      roomId: base.room.id,
      weekday: 2,
      startTime: '18:00',
      durationMinutes: 60,
      capacity: 12,
      validFrom: '2026-01-01',
      validUntil: null,
    };
    const first = await manager.post('/api/admin/schedules', body);
    expect(first.status).toBe(201);
    expect(first.body.generated).toBeGreaterThan(0);
    const clash = await manager.post('/api/admin/schedules', { ...body, startTime: '18:30' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SCHEDULE_CONFLICT');
    const overRoom = await manager.post('/api/admin/schedules', { ...body, weekday: 3, capacity: 99 });
    expect(overRoom.status).toBe(400);
  });
});
