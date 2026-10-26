import { HttpStatus, Injectable } from '@nestjs/common';
import {
  applyPromotion,
  checkPromotionEligibility,
  zonedDateTime,
  addDaysToKey,
  type PromotionInput,
} from '@fitclub/shared';
import type { MembershipPlan, Promotion } from '../../generated/prisma/client';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AppError, conflict, notFound } from '../../common/errors';
import type { AuthUser } from '../../common/auth-context';
import { AuditService } from '../audit/audit.service';

export interface Quote {
  subtotal: number;
  discount: number;
  total: number;
  promotion: Pick<Promotion, 'id' | 'code' | 'name' | 'type' | 'value'> | null;
}

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Price for `plan` after an optional promo code. Throws PROMO_INVALID with the rejection reason. */
  async quote(tx: Tx, memberId: string | null, plan: MembershipPlan, code?: string): Promise<Quote> {
    if (!code) return { ...applyPromotion(plan.price, null), promotion: null };
    const promo = await tx.promotion.findUnique({ where: { code } });
    if (!promo)
      throw new AppError('PROMO_INVALID', HttpStatus.UNPROCESSABLE_ENTITY, 'Promo code not found', {
        reason: 'NOT_FOUND',
      });
    const [memberRedemptions, prior] = memberId
      ? await Promise.all([
          tx.promotionRedemption.count({ where: { promotionId: promo.id, memberId } }),
          tx.membership.count({ where: { memberId, status: { in: ['ACTIVE', 'FROZEN', 'EXPIRED'] } } }),
        ])
      : [0, 0];
    const decision = checkPromotionEligibility(promo, {
      now: new Date(),
      planId: plan.id,
      amount: plan.price,
      memberRedemptions,
      memberHasPriorMembership: prior > 0,
    });
    if (!decision.ok)
      throw new AppError('PROMO_INVALID', HttpStatus.UNPROCESSABLE_ENTITY, 'Promo code cannot be applied', {
        reason: decision.reason,
      });
    return {
      ...applyPromotion(plan.price, promo),
      promotion: { id: promo.id, code: promo.code, name: promo.name, type: promo.type, value: promo.value },
    };
  }

  /** Records a redemption atomically; the conditional update stops a code from exceeding its limit. */
  async redeem(tx: Tx, promotionId: string, memberId: string, paymentId: string, discount: number) {
    const ok = await tx.$executeRaw`
      UPDATE "Promotion" SET "redemptionCount" = "redemptionCount" + 1, "updatedAt" = NOW()
      WHERE id = ${promotionId} AND ("maxRedemptions" IS NULL OR "redemptionCount" < "maxRedemptions")`;
    await tx.promotionRedemption.create({ data: { promotionId, memberId, paymentId, discount } });
    return ok === 1;
  }

  async listPublic() {
    const now = new Date();
    return this.prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        isPublic: true,
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        type: true,
        value: true,
        validFrom: true,
        validUntil: true,
        imageUrl: true,
        planIds: true,
        newMembersOnly: true,
      },
    });
  }

  async listAll() {
    const promos = await this.prisma.promotion.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
    const stats = await this.prisma.promotionRedemption.groupBy({
      by: ['promotionId'],
      _sum: { discount: true },
      _count: true,
    });
    const revenue = await this.prisma.payment.groupBy({
      by: ['promotionId'],
      where: { promotionId: { not: null }, status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } },
      _sum: { amount: true },
    });
    const statMap = new Map(stats.map((s) => [s.promotionId, s]));
    const revMap = new Map(revenue.map((r) => [r.promotionId, r._sum.amount ?? 0]));
    return promos.map((p) => ({
      ...p,
      performance: {
        redemptions: statMap.get(p.id)?._count ?? 0,
        discountGiven: statMap.get(p.id)?._sum.discount ?? 0,
        revenue: revMap.get(p.id) ?? 0,
      },
    }));
  }

  private data(input: PromotionInput) {
    return {
      code: input.code,
      name: input.name,
      description: input.description,
      type: input.type,
      value: input.value,
      status: input.status,
      validFrom: input.validFrom ? zonedDateTime(input.validFrom) : null,
      validUntil: input.validUntil ? zonedDateTime(addDaysToKey(input.validUntil, 1)) : null,
      maxRedemptions: input.maxRedemptions,
      perMemberLimit: input.perMemberLimit,
      newMembersOnly: input.newMembersOnly,
      planIds: input.planIds,
      minAmount: input.minAmount,
      isPublic: input.isPublic,
      imageUrl: input.imageUrl,
    };
  }

  async create(actor: AuthUser, input: PromotionInput) {
    if (input.code && (await this.prisma.promotion.findUnique({ where: { code: input.code } }))) {
      throw conflict('CONFLICT', 'This promo code already exists');
    }
    const promo = await this.prisma.promotion.create({ data: this.data(input) });
    await this.audit.log(actor, {
      action: 'promotion.create',
      entityType: 'Promotion',
      entityId: promo.id,
      metadata: { code: promo.code },
    });
    return promo;
  }

  async update(actor: AuthUser, id: string, input: PromotionInput) {
    const existing = await this.prisma.promotion.findUnique({ where: { id } });
    if (!existing) throw notFound('Promotion');
    if (
      input.code &&
      input.code !== existing.code &&
      (await this.prisma.promotion.findUnique({ where: { code: input.code } }))
    ) {
      throw conflict('CONFLICT', 'This promo code already exists');
    }
    const promo = await this.prisma.promotion.update({ where: { id }, data: this.data(input) });
    await this.audit.log(actor, {
      action: 'promotion.update',
      entityType: 'Promotion',
      entityId: id,
      metadata: { status: promo.status },
    });
    return promo;
  }
}
