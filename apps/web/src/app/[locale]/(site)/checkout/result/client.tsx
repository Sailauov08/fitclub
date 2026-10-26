'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/display';

interface Status {
  id: string;
  status: string;
  amount: number;
  isTest: boolean;
  invoiceNumber: string | null;
  membership: { id: string; status: string; endsAt: string } | null;
}

/** Shows the server-confirmed payment state; it polls while the provider has not reported back yet. */
export function CheckoutResultPage() {
  const t = useTranslations('checkoutResult');
  const fmt = useFmt();
  const paymentId = useSearchParams().get('payment') ?? '';
  const { data, isLoading } = useQuery({
    queryKey: ['payment-status', paymentId],
    queryFn: () => api.get<Status>(`/payments/${paymentId}/status`),
    enabled: Boolean(paymentId),
    refetchInterval: (q) =>
      q.state.data && ['PENDING', 'REQUIRES_ACTION'].includes(q.state.data.status) ? 3000 : false,
  });

  const success = data?.status === 'SUCCEEDED';
  const pending = data && ['PENDING', 'REQUIRES_ACTION'].includes(data.status);
  return (
    <div className="container-page flex justify-center py-20">
      <Card className="w-full max-w-lg p-10 text-center">
        {isLoading || !data ? (
          <Skeleton className="mx-auto h-40" />
        ) : (
          <>
            {success ? (
              <CheckCircle2 className="mx-auto size-12 text-success" />
            ) : pending ? (
              <Clock className="mx-auto size-12 text-warning" />
            ) : (
              <XCircle className="mx-auto size-12 text-danger" />
            )}
            <h1 className="mt-5 font-display text-2xl font-semibold">
              {success ? t('successTitle') : pending ? t('pendingTitle') : t('failedTitle')}
            </h1>
            <p className="mt-3 text-muted">
              {success
                ? t('successBody', { date: data.membership ? fmt.lastDay(data.membership.endsAt) : '—' })
                : pending
                  ? t('pendingBody')
                  : t('failedBody')}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Badge>{fmt.money(data.amount)}</Badge>
              {data.invoiceNumber && <Badge tone="info">{data.invoiceNumber}</Badge>}
              {data.isTest && <Badge tone="warning">{t('testPayment')}</Badge>}
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {success ? (
                <Button asChild>
                  <Link href="/account">{t('toAccount')}</Link>
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link href="/memberships">{t('tryAgain')}</Link>
                </Button>
              )}
              {success && (
                <Button asChild variant="outline">
                  <Link href="/schedule">{t('bookClass')}</Link>
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
