'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { QrCode, RefreshCw } from 'lucide-react';
import { daysRemaining, remainingVisits, type MembershipStatus, type PaymentStatus } from '@fitclub/shared';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import type { MembershipRow } from '@/lib/types';
import { Badge, type Tone } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTrigger } from '@/components/ui/dialog';

const MEMBERSHIP_TONE: Record<MembershipStatus, Tone> = {
  ACTIVE: 'success',
  FROZEN: 'info',
  PENDING: 'warning',
  EXPIRED: 'neutral',
  CANCELLED: 'danger',
};
export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  const t = useTranslations('enums.membershipStatus');
  return <Badge tone={MEMBERSHIP_TONE[status]}>{t(status)}</Badge>;
}

const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  PENDING: 'warning',
  REQUIRES_ACTION: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  PARTIALLY_REFUNDED: 'info',
  REFUNDED: 'info',
};
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = useTranslations('enums.paymentStatus');
  return <Badge tone={PAYMENT_TONE[status]}>{t(status)}</Badge>;
}

/** Big summary card of the member's current membership. */
export function MembershipCard({ membership }: { membership: MembershipRow }) {
  const t = useTranslations('account.membership');
  const fmt = useFmt();
  const left = daysRemaining(new Date(membership.endsAt), new Date());
  const visits = remainingVisits(membership);
  const total = Math.max(
    1,
    Math.round((new Date(membership.endsAt).getTime() - new Date(membership.startsAt).getTime()) / 86_400_000),
  );
  const progress = Math.min(100, Math.max(0, 100 - (left / total) * 100));
  return (
    <div className="grain relative overflow-hidden rounded-2xl bg-ink p-7 text-bone">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-bone/50">{t('current')}</p>
          <p className="mt-2 font-display text-2xl font-semibold">{fmt.t(membership.planSnapshot.name)}</p>
        </div>
        <MembershipStatusBadge status={membership.status} />
      </div>
      <div className="mt-8 grid grid-cols-3 gap-4">
        <div>
          <p className="font-display text-3xl font-semibold tabular-nums">{left}</p>
          <p className="text-xs text-bone/55">{t('daysLeft')}</p>
        </div>
        <div>
          <p className="font-display text-3xl font-semibold tabular-nums">{visits === null ? '∞' : visits}</p>
          <p className="text-xs text-bone/55">{t('visitsLeft')}</p>
        </div>
        <div>
          <p className="font-display text-lg font-semibold">{fmt.lastDay(membership.endsAt)}</p>
          <p className="text-xs text-bone/55">{t('validUntil')}</p>
        </div>
      </div>
      <div
        className="mt-7 h-1 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('progress')}
      >
        <div className="h-full rounded-full bg-ember" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

/**
 * Rotating check-in QR. Each code is a short-lived signed token fetched from the API and
 * refreshed every 60 seconds, so screenshots stop working quickly.
 */
export function CheckInPass() {
  const t = useTranslations('account.pass');
  const [open, setOpen] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const token = useQuery({
    queryKey: ['checkin-token'],
    queryFn: () => api.get<{ token: string; expiresAt: string }>('/me/checkin-token'),
    enabled: open,
    refetchInterval: open ? 60_000 : false,
    staleTime: 0,
  });
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!token.data) return;
    void QRCode.toString(token.data.token, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0e0f0d', light: '#ffffff' },
    }).then(setSvg);
  }, [token.data]);
  useEffect(() => {
    if (!token.data) return;
    const tick = () =>
      setSeconds(Math.max(0, Math.round((new Date(token.data!.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [token.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <QrCode /> {t('show')}
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader title={t('title')} description={t('description')} />
        <DialogBody className="flex flex-col items-center">
          <div className="aspect-square w-full max-w-[280px] rounded-xl border border-border bg-white p-3">
            {svg && !token.isFetching ? (
              <div className="size-full [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className="size-full animate-pulse rounded-lg bg-surface-2" />
            )}
          </div>
          <p className="mt-4 text-sm text-muted" aria-live="polite">
            {t('expires', { seconds })}
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => token.refetch()}>
            <RefreshCw /> {t('refresh')}
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
