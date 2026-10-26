import type { PaymentStatus } from '../enums';

/**
 * Payment state machine. Only server-side provider confirmations (verified webhooks or
 * authorised manual recording) may move a payment to SUCCEEDED; the browser never can.
 */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  REQUIRES_ACTION: ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  SUCCEEDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function isPaymentFinal(status: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[status].length === 0;
}

export function isPaymentCaptured(status: PaymentStatus): boolean {
  return status === 'SUCCEEDED' || status === 'PARTIALLY_REFUNDED' || status === 'REFUNDED';
}

/** Status after refunding `refundAmount` on top of `alreadyRefunded`, or an error if it would over-refund. */
export function nextStatusAfterRefund(
  payment: { status: PaymentStatus; amount: number },
  alreadyRefunded: number,
  refundAmount: number,
):
  | { ok: true; status: PaymentStatus }
  | { ok: false; reason: 'NOT_REFUNDABLE' | 'INVALID_AMOUNT' | 'EXCEEDS_CAPTURED' } {
  if (payment.status !== 'SUCCEEDED' && payment.status !== 'PARTIALLY_REFUNDED') {
    return { ok: false, reason: 'NOT_REFUNDABLE' };
  }
  if (!Number.isInteger(refundAmount) || refundAmount <= 0) return { ok: false, reason: 'INVALID_AMOUNT' };
  const total = alreadyRefunded + refundAmount;
  if (total > payment.amount) return { ok: false, reason: 'EXCEEDS_CAPTURED' };
  return { ok: true, status: total === payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED' };
}
