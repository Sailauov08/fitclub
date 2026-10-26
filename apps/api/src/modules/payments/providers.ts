import { Injectable } from '@nestjs/common';
import type { Locale } from '@fitclub/shared';
import { env, isProduction } from '../../config/env';
import { hmac, randomToken, safeEqual } from '../../common/crypto';

export interface ProviderEvent {
  eventId: string;
  providerRef: string;
  type: 'payment.succeeded' | 'payment.failed' | 'payment.cancelled';
  amount: number;
  currency: string;
  failureReason?: string;
}

/**
 * Contract for an online payment provider (e.g. a Kazakhstan acquiring bank or wallet).
 * A real adapter must: create the order server-side, return the hosted payment page URL,
 * verify webhook signatures, and report the captured amount. Card data never touches FITCLUB.
 */
export interface PaymentProviderAdapter {
  readonly id: 'SANDBOX';
  readonly isTest: boolean;
  createCheckout(input: {
    paymentId: string;
    amount: number;
    currency: string;
    description: string;
    locale: Locale;
  }): Promise<{
    providerRef: string;
    redirectUrl: string;
  }>;
  /** Verifies the signature and parses the payload; throws on any mismatch. */
  parseWebhook(rawBody: string, signature: string | undefined): ProviderEvent;
}

/**
 * Sandbox provider for development and the public demo. It never contacts a bank and never moves
 * money. Payments created through it are flagged `isTest` and shown as "Sandbox" everywhere.
 * Refused in production unless DEMO_MODE=true (a portfolio deployment with no real customers).
 */
@Injectable()
export class SandboxPaymentProvider implements PaymentProviderAdapter {
  readonly id = 'SANDBOX' as const;
  readonly isTest = true;

  get enabled() {
    return env.PAYMENTS_SANDBOX_ENABLED && (!isProduction || env.DEMO_MODE);
  }

  async createCheckout(input: {
    paymentId: string;
    amount: number;
    currency: string;
    description: string;
    locale: Locale;
  }) {
    const providerRef = `sbx_${randomToken(12)}`;
    return { providerRef, redirectUrl: `${env.PUBLIC_WEB_URL}/${input.locale}/checkout/sandbox?ref=${providerRef}` };
  }

  sign(rawBody: string): string {
    return hmac(env.SANDBOX_WEBHOOK_SECRET, rawBody);
  }

  parseWebhook(rawBody: string, signature: string | undefined): ProviderEvent {
    if (!this.enabled) throw new Error('Sandbox provider disabled');
    if (!signature || !safeEqual(signature, this.sign(rawBody))) throw new Error('Invalid sandbox signature');
    const body = JSON.parse(rawBody) as ProviderEvent;
    if (!body.eventId || !body.providerRef || !body.type || typeof body.amount !== 'number')
      throw new Error('Malformed sandbox event');
    return body;
  }
}
