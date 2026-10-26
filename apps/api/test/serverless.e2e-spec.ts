import './serverless-env';
import { createUser, login, resetDb, seedBase, setup, type Base, type TestContext } from './utils';

// Smallest valid PNG (1×1, transparent).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('Serverless hosting (database storage, cron endpoint, client IP)', () => {
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

  it('stores uploads in PostgreSQL and serves them immutable from /uploads', async () => {
    const user = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
    const client = await login(ctx, user.email);
    const res = await client.agent.post('/api/me/avatar').set('X-CSRF-Token', client.csrf).attach('file', PNG, 'a.png');
    expect(res.status).toBe(201);
    const url: string = res.body.avatarUrl ?? res.body.url;
    expect(url).toMatch(/^\/uploads\/avatars\/.+\.png$/);
    expect(await ctx.prisma.storedFile.count()).toBe(1);

    const file = await ctx.http().get(url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);

    expect((await ctx.http().get('/uploads/avatars/missing.png')).status).toBe(404);
  });

  it('runs all jobs from the cron endpoint only with the bearer secret', async () => {
    expect((await ctx.http().get('/api/cron/daily')).status).toBe(401);
    expect((await ctx.http().get('/api/cron/daily').set('Authorization', 'Bearer wrong')).status).toBe(401);

    const res = await ctx.http().get('/api/cron/daily').set('Authorization', 'Bearer test-cron-secret-value');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(
      expect.arrayContaining(['membershipMaintenance', 'generateSessions', 'cleanup']),
    );
    expect(res.body.membershipMaintenance).toEqual(expect.objectContaining({ expired: expect.any(Number) }));
    expect(await ctx.prisma.jobRun.count()).toBeGreaterThanOrEqual(7);
  });

  it('takes the client IP from the configured platform header', async () => {
    const user = await createUser(ctx.prisma, { member: { branchId: base.branchA.id } });
    await ctx
      .http()
      .post('/api/auth/login')
      .set('x-vercel-forwarded-for', '203.0.113.7')
      .send({ email: user.email, password: 'Test-password-2026' });
    const session = await ctx.prisma.session.findFirst({ where: { userId: user.id } });
    expect(session?.ip).toBe('203.0.113.7');
  });
});
