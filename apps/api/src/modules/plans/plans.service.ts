import { Injectable } from '@nestjs/common';
import type { PlanInput } from '@fitclub/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { conflict, notFound } from '../../common/errors';
import type { AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '../../generated/prisma/client';

const include = { branches: { select: { branchId: true } } } as const;
type PlanRow = Prisma.MembershipPlanGetPayload<{ include: typeof include }>;

export function serializePlan(plan: PlanRow) {
  const { branches, ...rest } = plan;
  return { ...rest, branchIds: branches.map((b) => b.branchId) };
}

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPublic() {
    const plans = await this.prisma.membershipPlan.findMany({
      where: { status: 'ACTIVE', isPublic: true },
      include,
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });
    return plans.map(serializePlan);
  }

  async listAll() {
    const plans = await this.prisma.membershipPlan.findMany({
      include: { ...include, _count: { select: { memberships: true } } },
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }],
    });
    const active = await this.prisma.membership.groupBy({
      by: ['planId'],
      where: { status: { in: ['ACTIVE', 'FROZEN'] } },
      _count: true,
    });
    const activeMap = new Map(active.map((a) => [a.planId, a._count]));
    return plans.map((p) => ({
      ...serializePlan(p),
      totalSold: p._count.memberships,
      activeCount: activeMap.get(p.id) ?? 0,
    }));
  }

  async get(id: string) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id }, include });
    if (!plan) throw notFound('Plan');
    return serializePlan(plan);
  }

  private data(input: PlanInput) {
    return {
      code: input.code,
      type: input.type,
      name: input.name,
      description: input.description,
      features: input.features,
      price: input.price,
      durationDays: input.durationDays,
      visitLimit: input.visitLimit,
      includesClasses: input.includesClasses,
      allBranches: input.allBranches,
      freezeMaxDays: input.freezeMaxDays,
      freezeMaxTimes: input.freezeMaxTimes,
      requiresStudentId: input.requiresStudentId,
      isPublic: input.isPublic,
      isFeatured: input.isFeatured,
      sortOrder: input.sortOrder,
    };
  }

  async create(user: AuthUser, input: PlanInput) {
    if (await this.prisma.membershipPlan.findUnique({ where: { code: input.code } })) {
      throw conflict('PLAN_CODE_TAKEN', 'A plan with this code already exists');
    }
    const plan = await this.prisma.membershipPlan.create({
      data: {
        ...this.data(input),
        branches: input.allBranches ? undefined : { create: input.branchIds.map((branchId) => ({ branchId })) },
      },
      include,
    });
    await this.audit.log(user, {
      action: 'plan.create',
      entityType: 'MembershipPlan',
      entityId: plan.id,
      metadata: { code: plan.code, price: plan.price },
    });
    return serializePlan(plan);
  }

  /**
   * Editing a plan bumps its version. Existing memberships are untouched because they carry
   * their own snapshot (price, duration, limits, freeze rules) from the moment of sale.
   */
  async update(user: AuthUser, id: string, input: PlanInput) {
    const before = await this.get(id);
    if (before.code !== input.code && (await this.prisma.membershipPlan.findUnique({ where: { code: input.code } }))) {
      throw conflict('PLAN_CODE_TAKEN', 'A plan with this code already exists');
    }
    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.planBranch.deleteMany({ where: { planId: id } });
      return tx.membershipPlan.update({
        where: { id },
        data: {
          ...this.data(input),
          version: { increment: 1 },
          branches: input.allBranches ? undefined : { create: input.branchIds.map((branchId) => ({ branchId })) },
        },
        include,
      });
    });
    await this.audit.log(user, {
      action: 'plan.update',
      entityType: 'MembershipPlan',
      entityId: id,
      metadata: { version: plan.version, priceBefore: before.price, priceAfter: plan.price },
    });
    return serializePlan(plan);
  }

  async setStatus(user: AuthUser, id: string, status: 'ACTIVE' | 'ARCHIVED') {
    await this.get(id);
    const plan = await this.prisma.membershipPlan.update({ where: { id }, data: { status }, include });
    await this.audit.log(user, {
      action: status === 'ARCHIVED' ? 'plan.archive' : 'plan.restore',
      entityType: 'MembershipPlan',
      entityId: id,
    });
    return serializePlan(plan);
  }
}
