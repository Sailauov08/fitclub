'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FlaskConical, XCircle, CheckCircle2, Ban } from 'lucide-react';
import type { LocalizedText } from '@fitclub/shared';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/display';
import { useErrorMessage } from '@/components/providers';

interface SandboxCheckout {
  providerRef: string;
  paymentId: string;
  amount: number;
  subtotal: number;
  discount: number;
  status: string;
  purpose: string;
  planName: LocalizedText | null;
}

/**
 * DEVELOPMENT SANDBOX. Stands in for a bank's hosted payment page. The buttons ask the API to
 * emit a correctly signed provider event, so the real webhook/state-machine code path runs — but
 * no money moves and the payment stays flagged as a test payment.
 */
export function SandboxCheckoutPage() {
  const t = useTranslations('sandbox');
  const fmt = useFmt();
  const router = useRouter();
  const ref = useSearchParams().get('ref') ?? '';
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkout = useQuery({
    queryKey: ['sandbox', ref],
    queryFn: () => api.get<SandboxCheckout>(`/payments/sandbox/${ref}`),
    enabled: Boolean(ref),
  });

  const simulate = async (outcome: 'success' | 'failure' | 'cancel') => {
    setBusy(outcome);
    setError(null);
    try {
      const res = await api.post<{ id: string }>(`/payments/sandbox/${ref}/simulate`, { outcome });
      router.push(`/checkout/result?payment=${res.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <div className="container-page flex justify-center py-16">
      <div className="w-full max-w-lg">
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
          <FlaskConical className="size-5 shrink-0" />
          <p>
            <strong>{t('badge')}</strong> {t('notice')}
          </p>
        </div>
        <Card className="p-8">
          {checkout.isLoading ? (
            <Skeleton className="h-40" />
          ) : checkout.isError || !checkout.data ? (
            <p className="text-danger">{errorMessage(checkout.error)}</p>
          ) : (
            <>
              <p className="eyebrow text-muted">{t('provider')}</p>
              <h1 className="mt-2 text-xl font-semibold">
                {checkout.data.planName ? fmt.t(checkout.data.planName) : t('payment')}
              </h1>
              <p className="mt-6 font-display text-4xl font-semibold">{fmt.money(checkout.data.amount)}</p>
              {checkout.data.discount > 0 && (
                <p className="mt-1 text-sm text-muted">
                  {t('discount', { amount: fmt.money(checkout.data.discount) })}
                </p>
              )}
              <p className="mt-4 break-all font-mono text-xs text-muted">ref: {checkout.data.providerRef}</p>
              {checkout.data.status !== 'REQUIRES_ACTION' && checkout.data.status !== 'PENDING' ? (
                <p className="mt-6 rounded-md bg-surface-2 p-3 text-sm">
                  {t('alreadyProcessed', { status: checkout.data.status })}
                </p>
              ) : (
                <div className="mt-8 grid gap-3">
                  <Button
                    size="lg"
                    onClick={() => simulate('success')}
                    loading={busy === 'success'}
                    disabled={Boolean(busy)}
                  >
                    <CheckCircle2 /> {t('success')}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => simulate('failure')}
                    loading={busy === 'failure'}
                    disabled={Boolean(busy)}
                  >
                    <XCircle /> {t('failure')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => simulate('cancel')}
                    loading={busy === 'cancel'}
                    disabled={Boolean(busy)}
                  >
                    <Ban /> {t('cancel')}
                  </Button>
                </div>
              )}
              {error && <p className="mt-4 text-sm text-danger">{error}</p>}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
