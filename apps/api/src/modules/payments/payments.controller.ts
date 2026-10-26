import { Controller, Get, Headers, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { paymentListQuerySchema, promotionInputSchema, reconcileSchema, refundSchema } from '@fitclub/shared';
import {
  CurrentUser,
  MemberOnly,
  Public,
  RequirePermissions,
  requireMemberId,
  type AuthUser,
} from '../../common/auth-context';
import { badRequest } from '../../common/errors';
import { ZBody, ZQuery } from '../../common/zod';
import { PromotionsService } from '../promotions/promotions.service';
import { PaymentsService } from './payments.service';
import { SandboxPaymentProvider } from './providers';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly sandbox: SandboxPaymentProvider,
  ) {}

  @Public()
  @Get('provider-status')
  status() {
    return this.payments.providerStatus;
  }

  @Get(':id/status')
  checkoutStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.checkoutStatus(user, id);
  }

  @Get('sandbox/:ref')
  sandboxCheckout(@CurrentUser() user: AuthUser, @Param('ref') ref: string) {
    return this.payments.sandboxCheckout(user, ref);
  }

  @HttpCode(200)
  @Post('sandbox/:ref/simulate')
  simulate(
    @CurrentUser() user: AuthUser,
    @Param('ref') ref: string,
    @ZBody(z.object({ outcome: z.enum(['success', 'failure', 'cancel']) }))
    body: { outcome: 'success' | 'failure' | 'cancel' },
  ) {
    return this.payments.simulateSandbox(user, ref, body.outcome);
  }

  /** Provider → server callback. Authenticated by HMAC signature over the raw body (no cookies, CSRF-exempt). */
  @Public()
  @HttpCode(200)
  @Post('webhooks/sandbox')
  async sandboxWebhook(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-sandbox-signature') signature?: string) {
    const raw = req.rawBody?.toString('utf8') ?? '';
    let event;
    try {
      event = this.sandbox.parseWebhook(raw, signature);
    } catch {
      throw badRequest('VALIDATION_FAILED', 'Invalid webhook signature or payload');
    }
    return this.payments.handleProviderEvent('SANDBOX', event, JSON.parse(raw));
  }
}

@ApiTags('me/payments')
@MemberOnly()
@Controller('me')
export class MyPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments')
  list(@CurrentUser() user: AuthUser) {
    return this.payments.memberPayments(requireMemberId(user));
  }

  @Get('invoices/:id')
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.invoice(user, id, user.locale);
  }
}

@ApiTags('admin/payments')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermissions(['payments.read'])
  @Get()
  list(@CurrentUser() user: AuthUser, @ZQuery(paymentListQuerySchema) q: z.infer<typeof paymentListQuerySchema>) {
    return this.payments.list(user, q);
  }

  @RequirePermissions(['payments.read'])
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.get(user, id);
  }

  @RequirePermissions(['payments.read'])
  @Get('invoices/:id')
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.invoice(user, id, user.locale);
  }

  @RequirePermissions(['payments.refund'])
  @Post(':id/refunds')
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(refundSchema.extend({ cancelMembership: z.boolean().default(false) }))
    body: z.infer<typeof refundSchema> & { cancelMembership: boolean },
  ) {
    return this.payments.refund(user, id, body);
  }

  @RequirePermissions(['payments.reconcile'])
  @Put(':id/reconciliation')
  reconcile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(reconcileSchema) body: z.infer<typeof reconcileSchema>,
  ) {
    return this.payments.reconcile(user, id, body.status, body.note);
  }
}

@ApiTags('promotions')
@Controller()
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Public()
  @Get('promotions')
  listPublic() {
    return this.promotions.listPublic();
  }

  @RequirePermissions(['promotions.manage'])
  @Get('admin/promotions')
  listAll() {
    return this.promotions.listAll();
  }

  @RequirePermissions(['promotions.manage'])
  @Post('admin/promotions')
  create(@CurrentUser() user: AuthUser, @ZBody(promotionInputSchema) body: z.infer<typeof promotionInputSchema>) {
    return this.promotions.create(user, body);
  }

  @RequirePermissions(['promotions.manage'])
  @Put('admin/promotions/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(promotionInputSchema) body: z.infer<typeof promotionInputSchema>,
  ) {
    return this.promotions.update(user, id, body);
  }
}
