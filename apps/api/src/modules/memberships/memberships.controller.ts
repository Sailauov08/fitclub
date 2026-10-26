import { Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  cancelMembershipSchema,
  extendMembershipSchema,
  freezeMembershipSchema,
  planInputSchema,
  purchaseMembershipSchema,
  renewMembershipSchema,
  staffSellMembershipSchema,
  validatePromoSchema,
  PAYMENT_METHODS,
} from '@fitclub/shared';
import {
  CurrentUser,
  MemberOnly,
  Public,
  RequirePermissions,
  requireMemberId,
  type AuthUser,
} from '../../common/auth-context';
import { ZBody } from '../../common/zod';
import { notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import { PaymentsService } from '../payments/payments.service';
import { PromotionsService } from '../promotions/promotions.service';
import { MembershipsService } from './memberships.service';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Public()
  @Get()
  list() {
    return this.plans.listPublic();
  }
}

@ApiTags('admin/plans')
@Controller('admin/plans')
export class AdminPlansController {
  constructor(private readonly plans: PlansService) {}

  @RequirePermissions(['memberships.read'])
  @Get()
  list() {
    return this.plans.listAll();
  }

  @RequirePermissions(['plans.manage'])
  @Post()
  create(@CurrentUser() user: AuthUser, @ZBody(planInputSchema) body: z.infer<typeof planInputSchema>) {
    return this.plans.create(user, body);
  }

  @RequirePermissions(['plans.manage'])
  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(planInputSchema) body: z.infer<typeof planInputSchema>,
  ) {
    return this.plans.update(user, id, body);
  }

  @RequirePermissions(['plans.manage'])
  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plans.setStatus(user, id, 'ARCHIVED');
  }

  @RequirePermissions(['plans.manage'])
  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plans.setStatus(user, id, 'ACTIVE');
  }
}

/** Member self-service. Members can only act on their own memberships and only through policy-checked operations. */
@ApiTags('me/memberships')
@MemberOnly()
@Controller('me/memberships')
export class MyMembershipsController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly payments: PaymentsService,
    private readonly promotions: PromotionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.memberships.listForMember(requireMemberId(user));
  }

  @HttpCode(200)
  @Post('quote')
  async quote(@CurrentUser() user: AuthUser, @ZBody(validatePromoSchema) body: z.infer<typeof validatePromoSchema>) {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: body.planId, status: 'ACTIVE', isPublic: true },
    });
    if (!plan) throw notFound('Plan');
    return this.promotions.quote(this.prisma, requireMemberId(user), plan, body.code);
  }

  @Post('purchase')
  purchase(
    @CurrentUser() user: AuthUser,
    @ZBody(purchaseMembershipSchema) body: z.infer<typeof purchaseMembershipSchema>,
  ) {
    return this.payments.startPurchase(user, requireMemberId(user), body);
  }

  @Post(':id/renew')
  renew(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(renewMembershipSchema) body: z.infer<typeof renewMembershipSchema>,
  ) {
    return this.payments.startRenewal(user, requireMemberId(user), id, body.promoCode);
  }

  @Post(':id/freeze')
  freeze(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(freezeMembershipSchema) body: z.infer<typeof freezeMembershipSchema>,
  ) {
    return this.memberships.freeze(user, id, body, { selfService: true });
  }

  @HttpCode(204)
  @Post(':id/unfreeze')
  async unfreeze(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.memberships.unfreeze(user, id, { selfService: true });
  }

  @HttpCode(204)
  @Post('freezes/:freezeId/cancel')
  async cancelFreeze(@CurrentUser() user: AuthUser, @Param('freezeId') freezeId: string) {
    await this.memberships.cancelScheduledFreeze(user, freezeId, { selfService: true });
  }
}

const staffRenewSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentReference: z.string().trim().max(120).optional(),
  promoCode: z.string().trim().toUpperCase().max(40).optional(),
});

@ApiTags('admin/memberships')
@Controller('admin/memberships')
export class AdminMembershipsController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly payments: PaymentsService,
  ) {}

  @RequirePermissions(['memberships.sell'])
  @Post('sell')
  sell(
    @CurrentUser() user: AuthUser,
    @ZBody(staffSellMembershipSchema) body: z.infer<typeof staffSellMembershipSchema>,
  ) {
    return this.payments.staffSell(user, body);
  }

  @RequirePermissions(['memberships.sell', 'payments.record'])
  @Post(':id/renew')
  renew(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(staffRenewSchema) body: z.infer<typeof staffRenewSchema>,
  ) {
    return this.payments.staffRenew(user, id, body);
  }

  @RequirePermissions(['memberships.manage'])
  @Post(':id/freeze')
  freeze(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(freezeMembershipSchema) body: z.infer<typeof freezeMembershipSchema>,
  ) {
    return this.memberships.freeze(user, id, body, { selfService: false });
  }

  @RequirePermissions(['memberships.manage'])
  @HttpCode(204)
  @Post(':id/unfreeze')
  async unfreeze(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.memberships.unfreeze(user, id, { selfService: false });
  }

  @RequirePermissions(['memberships.manage'])
  @HttpCode(204)
  @Post('freezes/:freezeId/cancel')
  async cancelFreeze(@CurrentUser() user: AuthUser, @Param('freezeId') freezeId: string) {
    await this.memberships.cancelScheduledFreeze(user, freezeId, { selfService: false });
  }

  @RequirePermissions(['memberships.manage'])
  @HttpCode(204)
  @Post(':id/extend')
  async extend(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(extendMembershipSchema) body: z.infer<typeof extendMembershipSchema>,
  ) {
    await this.memberships.extend(user, id, body.days, body.reason);
  }

  @RequirePermissions(['memberships.manage'])
  @HttpCode(204)
  @Post(':id/cancel')
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(cancelMembershipSchema) body: z.infer<typeof cancelMembershipSchema>,
  ) {
    await this.memberships.cancel(user, id, body.reason);
  }
}
