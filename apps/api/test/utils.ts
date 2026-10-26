import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import argon2 from 'argon2';
import {
  addDaysToKey,
  computeMembershipPeriod,
  DEFAULT_CLUB_SETTINGS,
  DEFAULT_NOTIFICATION_PREFS,
  localDateKey,
  zonedDateTime,
  type StaffRole,
} from '@fitclub/shared';
import { createApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';
import type { MembershipStatus, Prisma } from '../src/generated/prisma/client';

export const PASSWORD = 'Test-password-2026';
let hash: string | null = null;
let counter = 0;

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function setup(): Promise<TestContext> {
  const app = await createApp();
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

/** Empties every table in the test database. */
export async function resetDb(prisma: PrismaService) {
  const tables = await prisma.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export async function seedBase(prisma: PrismaService) {
  const club = await prisma.club.create({ data: { name: 'Test club', settings: DEFAULT_CLUB_SETTINGS } });
  const hours = Array.from({ length: 7 }, () => ({ open: '06:00', close: '23:00', closed: false }));
  const mk = (slug: string) =>
    prisma.branch.create({
      data: {
        clubId: club.id,
        slug,
        name: { kk: slug, ru: slug, en: slug },
        city: { kk: 'A', ru: 'A', en: 'A' },
        address: { kk: 'x', ru: 'x', en: 'x' },
        description: { kk: '', ru: '', en: '' },
        phone: '',
        email: '',
        openingHours: hours,
      },
    });
  const branchA = await mk('branch-a');
  const branchB = await mk('branch-b');
  const room = await prisma.room.create({
    data: {
      branchId: branchA.id,
      name: { kk: 'R', ru: 'R', en: 'R' },
      capacity: 30,
      equipment: { kk: '', ru: '', en: '' },
    },
  });
  const category = await prisma.classCategory.create({
    data: { slug: 'strength', name: { kk: 'S', ru: 'S', en: 'S' } },
  });
  const classType = await prisma.classType.create({
    data: {
      slug: 'hiit',
      categoryId: category.id,
      name: { kk: 'HIIT', ru: 'HIIT', en: 'HIIT' },
      summary: { kk: '', ru: '', en: '' },
      description: { kk: '', ru: '', en: '' },
      difficulty: 'ALL_LEVELS',
      durationMinutes: 45,
      defaultCapacity: 10,
    },
  });
  const planData = (code: string, extra: Partial<Prisma.MembershipPlanCreateInput> = {}) => ({
    code,
    type: 'MONTHLY' as const,
    name: { kk: code, ru: code, en: code },
    description: { kk: '', ru: '', en: '' },
    features: [],
    price: 30000,
    durationDays: 30,
    includesClasses: true,
    allBranches: true,
    freezeMaxDays: 14,
    freezeMaxTimes: 2,
    ...extra,
  });
  const unlimited = await prisma.membershipPlan.create({ data: planData('UNLIMITED'), include: { branches: true } });
  const gymOnly = await prisma.membershipPlan.create({
    data: {
      ...planData('GYM', { includesClasses: false, allBranches: false }),
      branches: { create: [{ branchId: branchA.id }] },
    },
    include: { branches: true },
  });
  const pack = await prisma.membershipPlan.create({
    data: planData('PACK2', { visitLimit: 2, freezeMaxDays: 0, freezeMaxTimes: 0 }),
    include: { branches: true },
  });
  return { club, branchA, branchB, room, classType, plans: { unlimited, gymOnly, pack } };
}
export type Base = Awaited<ReturnType<typeof seedBase>>;

export async function createUser(
  prisma: PrismaService,
  opts: { role?: StaffRole; branchId?: string | null; member?: { branchId: string }; email?: string } = {},
) {
  hash ??= await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1 });
  counter += 1;
  const email = opts.email ?? `user${counter}-${Date.now()}@test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hash,
      emailVerifiedAt: new Date(),
      profile: {
        create: { firstName: 'Test', lastName: `User${counter}`, notificationPrefs: DEFAULT_NOTIFICATION_PREFS },
      },
      ...(opts.role ? { staff: { create: { role: opts.role, branchId: opts.branchId ?? null } } } : {}),
      ...(opts.member ? { member: { create: { homeBranchId: opts.member.branchId } } } : {}),
    },
    include: { member: true },
  });
  return { ...user, memberId: user.member?.id ?? null };
}

export async function giveMembership(
  prisma: PrismaService,
  memberId: string,
  plan: Base['plans']['unlimited'],
  opts: { status?: MembershipStatus; startKey?: string; visitsUsed?: number } = {},
) {
  const period = computeMembershipPeriod(
    opts.startKey ?? addDaysToKey(localDateKey(new Date()), -1),
    plan.durationDays,
  );
  return prisma.membership.create({
    data: {
      memberId,
      planId: plan.id,
      status: opts.status ?? 'ACTIVE',
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      planSnapshot: { code: plan.code, name: plan.name, durationDays: plan.durationDays },
      planVersion: 1,
      price: plan.price,
      visitLimit: plan.visitLimit,
      visitsUsed: opts.visitsUsed ?? 0,
      includesClasses: plan.includesClasses,
      allBranches: plan.allBranches,
      branchIds: plan.branches.map((b) => b.branchId),
      freezeMaxDays: plan.freezeMaxDays,
      freezeMaxTimes: plan.freezeMaxTimes,
      activatedAt: new Date(),
    },
  });
}

export async function createSession(
  prisma: PrismaService,
  base: Base,
  opts: { capacity?: number; hoursFromNow?: number; trainerId?: string } = {},
) {
  let trainerId = opts.trainerId;
  if (!trainerId) {
    const trainer = await prisma.trainer.create({
      data: {
        slug: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        branchId: base.branchA.id,
        displayName: 'Coach',
        headline: { kk: '', ru: '', en: '' },
        bio: { kk: '', ru: '', en: '' },
        specializations: [],
        certifications: [],
      },
    });
    trainerId = trainer.id;
  }
  const startsAt = new Date(Date.now() + (opts.hoursFromNow ?? 24) * 3_600_000);
  return prisma.classSession.create({
    data: {
      classTypeId: base.classType.id,
      trainerId,
      roomId: base.room.id,
      branchId: base.branchA.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * 60_000),
      capacity: opts.capacity ?? 10,
    },
  });
}

/** Signs in and returns a client that sends the session cookie and CSRF header automatically. */
export async function login(ctx: TestContext, email: string, password = PASSWORD) {
  const agent = request.agent(ctx.app.getHttpServer());
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const csrf = cookies.map((c) => /fc_csrf=([^;]+)/.exec(c)?.[1]).find(Boolean) ?? '';
  return {
    agent,
    csrf,
    get: (url: string) => agent.get(url),
    post: (url: string, body: object = {}) => agent.post(url).set('X-CSRF-Token', csrf).send(body),
    put: (url: string, body: object = {}) => agent.put(url).set('X-CSRF-Token', csrf).send(body),
    patch: (url: string, body: object = {}) => agent.patch(url).set('X-CSRF-Token', csrf).send(body),
  };
}
export type Client = Awaited<ReturnType<typeof login>>;

export { zonedDateTime, localDateKey };
