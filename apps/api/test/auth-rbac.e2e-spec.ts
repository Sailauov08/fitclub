import {
  createUser,
  giveMembership,
  login,
  resetDb,
  seedBase,
  setup,
  PASSWORD,
  type Base,
  type TestContext,
} from './utils';

describe('Authentication & authorization (integration)', () => {
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

  describe('registration & sessions', () => {
    it('registers a member, sets HttpOnly session + CSRF cookies, and returns /me', async () => {
      const agent = ctx.http();
      const res = await agent.post('/api/auth/register').send({
        email: 'New.Member@Example.com',
        password: 'Strong-pass-2026',
        firstName: 'Айгерим',
        lastName: 'Тест',
        phone: '8 (701) 555-12-34',
        locale: 'kk',
        acceptTerms: true,
      });
      expect(res.status).toBe(201);
      const cookies = ([] as string[]).concat(res.headers['set-cookie']);
      const session = cookies.find((c) => c.startsWith('fc_session='))!;
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Lax/i);
      expect(cookies.find((c) => c.startsWith('fc_csrf='))).not.toMatch(/HttpOnly/i);

      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { email: 'new.member@example.com' },
        include: { profile: true, member: true },
      });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.profile?.phone).toBe('+77015551234');
      expect(user.member).not.toBeNull();
      const stored = await ctx.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session).not.toContain(stored.tokenHash);
    });

    it('rejects duplicate e-mails and invalid input with field-level issues', async () => {
      await createUser(ctx.prisma, { email: 'taken@test.local', member: { branchId: base.branchA.id } });
      const dup = await ctx.http().post('/api/auth/register').send({
        email: 'taken@test.local',
        password: 'Strong-pass-2026',
        firstName: 'A',
        lastName: 'B',
        phone: '+77011112233',
        acceptTerms: true,
      });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('EMAIL_TAKEN');

      const bad = await ctx.http().post('/api/auth/register').send({
        email: 'nope',
        password: 'short',
        firstName: '',
        lastName: 'B',
        phone: '+79161234567',
        acceptTerms: false,
      });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      const paths = bad.body.error.details.issues.map((i: { path: string }) => i.path);
      expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'firstName', 'phone', 'acceptTerms']));
    });

    it('ignores mass-assigned privileged fields on registration', async () => {
      const res = await ctx
        .http()
        .post('/api/auth/register')
        .send({
          email: 'sneaky@test.local',
          password: 'Strong-pass-2026',
          firstName: 'A',
          lastName: 'B',
          phone: '+77011112233',
          acceptTerms: true,
          role: 'OWNER',
          staff: { create: { role: 'OWNER' } },
          status: 'ACTIVE',
        });
      expect(res.status).toBe(201);
      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { email: 'sneaky@test.local' },
        include: { staff: true },
      });
      expect(user.staff).toBeNull();
    });

    it('uses a generic error for wrong passwords and locks the account after repeated failures', async () => {
      const u = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const unknown = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'ghost@test.local', password: 'whatever-123' });
      expect(unknown.status).toBe(401);
      expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
      for (let i = 0; i < 5; i++) {
        const r = await ctx.http().post('/api/auth/login').send({ email: u.email, password: 'wrong-password-1' });
        expect(r.status).toBe(401);
      }
      const locked = await ctx.http().post('/api/auth/login').send({ email: u.email, password: PASSWORD });
      expect(locked.status).toBe(429);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('requires the CSRF header for authenticated state changes and rejects foreign origins', async () => {
      const u = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const client = await login(ctx, u.email);
      const noCsrf = await client.agent.post('/api/auth/logout');
      expect(noCsrf.status).toBe(403);
      expect(noCsrf.body.error.code).toBe('CSRF_INVALID');
      const foreign = await ctx
        .http()
        .post('/api/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: u.email, password: PASSWORD });
      expect(foreign.status).toBe(403);
      const ok = await client.post('/api/auth/logout');
      expect(ok.status).toBe(204);
      const after = await client.get('/api/auth/me');
      expect(after.status).toBe(401);
    });

    it('password reset tokens are single-use, expire, and revoke sessions', async () => {
      const u = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const client = await login(ctx, u.email);
      const res = await ctx.http().post('/api/auth/forgot-password').send({ email: u.email });
      expect(res.status).toBe(202);
      // The raw token only exists in the e-mail; recreate one we control for the test.
      const { AuthService } = await import('../src/modules/auth/auth.service');
      const token = await ctx.app.get(AuthService).issueToken('PASSWORD_RESET', u.email, u.id);
      const reset = await ctx.http().post('/api/auth/reset-password').send({ token, password: 'Brand-new-pass-77' });
      expect(reset.status).toBe(204);
      const reuse = await ctx.http().post('/api/auth/reset-password').send({ token, password: 'Another-pass-88' });
      expect(reuse.status).toBe(400);
      expect(reuse.body.error.code).toBe('TOKEN_INVALID');
      expect((await client.get('/api/auth/me')).status).toBe(401);
      await login(ctx, u.email, 'Brand-new-pass-77');

      const expired = await ctx.app.get(AuthService).issueToken('PASSWORD_RESET', u.email, u.id);
      await ctx.prisma.authToken.updateMany({
        where: { usedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (await ctx.http().post('/api/auth/reset-password').send({ token: expired, password: 'Brand-new-pass-99' }))
          .status,
      ).toBe(400);
    });

    it('does not reveal whether an e-mail exists on forgot-password', async () => {
      const res = await ctx.http().post('/api/auth/forgot-password').send({ email: 'nobody@test.local' });
      expect(res.status).toBe(202);
    });
  });

  describe('role-based access control', () => {
    it('blocks anonymous and member access to admin endpoints', async () => {
      expect((await ctx.http().get('/api/admin/members')).status).toBe(401);
      const m = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const member = await login(ctx, m.email);
      for (const url of [
        '/api/admin/members',
        '/api/admin/payments',
        '/api/admin/staff',
        '/api/admin/audit',
        '/api/admin/analytics/overview',
        '/api/admin/settings',
      ]) {
        expect((await member.get(url)).status).toBe(403);
      }
    });

    it('enforces the permission matrix per role', async () => {
      const reception = await login(
        ctx,
        (await createUser(ctx.prisma, { role: 'RECEPTIONIST', branchId: base.branchA.id })).email,
      );
      const trainer = await login(
        ctx,
        (await createUser(ctx.prisma, { role: 'TRAINER', branchId: base.branchA.id })).email,
      );
      const sales = await login(ctx, (await createUser(ctx.prisma, { role: 'SALES' })).email);
      const manager = await login(ctx, (await createUser(ctx.prisma, { role: 'MANAGER' })).email);

      expect((await reception.get('/api/admin/members')).status).toBe(200);
      expect((await reception.get('/api/admin/payments')).status).toBe(403);
      expect(
        (await reception.post('/api/admin/payments/x/refunds', { amount: 100, reason: 'test refund' })).status,
      ).toBe(403);
      expect((await reception.get('/api/admin/audit')).status).toBe(403);

      const trainerList = await trainer.get('/api/admin/members');
      expect(trainerList.status).toBe(200);
      expect(trainerList.body.total).toBe(0); // only assigned members are visible
      expect((await trainer.get('/api/admin/leads')).status).toBe(403);

      expect((await sales.get('/api/admin/leads')).status).toBe(200);
      expect((await sales.get('/api/admin/staff')).status).toBe(403);
      expect((await manager.get('/api/admin/staff')).status).toBe(200);
      expect(
        (
          await manager.post('/api/admin/staff/invitations', {
            email: 'x@test.local',
            firstName: 'X',
            lastName: 'Y',
            role: 'RECEPTIONIST',
          })
        ).status,
      ).toBe(403);
      expect((await manager.get('/api/admin/settings')).status).toBe(403);
    });

    it('prevents self-promotion and upward role changes', async () => {
      const adminUser = await createUser(ctx.prisma, { role: 'ADMIN' });
      const otherAdmin = await createUser(ctx.prisma, { role: 'ADMIN' });
      const managerUser = await createUser(ctx.prisma, { role: 'MANAGER' });
      const owner = await createUser(ctx.prisma, { role: 'OWNER' });
      const admin = await login(ctx, adminUser.email);

      const self = await admin.put(`/api/admin/staff/${adminUser.id}`, { role: 'OWNER', branchId: null });
      expect(self.status).toBe(403);
      expect(self.body.error.details.reason).toBe('SELF_CHANGE');
      expect(
        (await admin.put(`/api/admin/staff/${managerUser.id}`, { role: 'ADMIN', branchId: null })).body.error.details
          .reason,
      ).toBe('RANK');
      expect((await admin.put(`/api/admin/staff/${otherAdmin.id}`, { role: 'TRAINER', branchId: null })).status).toBe(
        403,
      );
      expect(
        (await admin.post(`/api/admin/staff/${owner.id}/status`, { status: 'SUSPENDED', reason: 'takeover attempt' }))
          .status,
      ).toBe(403);
      expect((await admin.put(`/api/admin/staff/${managerUser.id}`, { role: 'SALES', branchId: null })).status).toBe(
        200,
      );

      const ownerClient = await login(ctx, owner.email);
      const lastOwner = await ownerClient.put(`/api/admin/staff/${owner.id}`, { role: 'ADMIN', branchId: null });
      expect(lastOwner.status).toBe(403); // self change is never allowed, even for owners
      expect(await ctx.prisma.auditLog.count({ where: { action: 'staff.role_change' } })).toBe(1);
    });

    it('revokes sessions of suspended staff immediately', async () => {
      const owner = await login(ctx, (await createUser(ctx.prisma, { role: 'OWNER' })).email);
      const recUser = await createUser(ctx.prisma, { role: 'RECEPTIONIST', branchId: base.branchA.id });
      const rec = await login(ctx, recUser.email);
      expect((await rec.get('/api/admin/members')).status).toBe(200);
      expect(
        (await owner.post(`/api/admin/staff/${recUser.id}/status`, { status: 'SUSPENDED', reason: 'left the company' }))
          .status,
      ).toBe(204);
      expect((await rec.get('/api/admin/members')).status).toBe(401);
      const relogin = await ctx.http().post('/api/auth/login').send({ email: recUser.email, password: PASSWORD });
      expect(relogin.status).toBe(403);
    });

    it('isolates branch-scoped staff from other branches', async () => {
      const inB = await createUser(ctx.prisma, { member: { branchId: base.branchB.id } });
      const recA = await login(
        ctx,
        (await createUser(ctx.prisma, { role: 'RECEPTIONIST', branchId: base.branchA.id })).email,
      );
      expect((await recA.get(`/api/admin/members/${inB.memberId}`)).status).toBe(404);
      const list = await recA.get('/api/admin/members');
      expect(list.body.items.map((m: { id: string }) => m.id)).not.toContain(inB.memberId);
      expect(
        (await recA.post('/api/admin/checkins', { memberId: inB.memberId, branchId: base.branchB.id })).status,
      ).toBe(403);
    });
  });

  describe('object-level authorization (members)', () => {
    it('members can only see and change their own records', async () => {
      const a = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const b = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
      const msB = await giveMembership(ctx.prisma, b.memberId!, base.plans.unlimited);
      const clientA = await login(ctx, a.email);

      const freeze = await clientA.post(`/api/me/memberships/${msB.id}/freeze`, {
        startDate: new Date().toISOString().slice(0, 10),
        days: 7,
      });
      expect(freeze.status).toBe(404);
      const renew = await clientA.post(`/api/me/memberships/${msB.id}/renew`, {});
      expect(renew.status).toBe(404);
      const list = await clientA.get('/api/me/memberships');
      expect(list.body).toHaveLength(0);

      // There is no endpoint a member can use to set status or dates directly.
      expect(
        (await clientA.patch(`/api/me/memberships/${msB.id}`, { status: 'ACTIVE', endsAt: '2099-01-01' })).status,
      ).toBe(404);
      expect(
        (await clientA.put(`/api/admin/memberships/${msB.id}/extend`, { days: 365, reason: 'free year' })).status,
      ).toBe(404);
      expect(
        (await clientA.post(`/api/admin/memberships/${msB.id}/extend`, { days: 365, reason: 'free year' })).status,
      ).toBe(403);
    });
  });

  it('applies rate limits to login when enabled', async () => {
    process.env.RATE_LIMIT_IN_TESTS = 'true';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++)
        statuses.push(
          (
            await ctx
              .http()
              .post('/api/auth/login')
              .send({ email: `rl${i}@test.local`, password: 'whatever-123' })
          ).status,
        );
      expect(statuses).toContain(429);
    } finally {
      delete process.env.RATE_LIMIT_IN_TESTS;
    }
  });
});
