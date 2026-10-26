'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useRouter, usePathname } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { useMe, useNow, usePublicSettings } from '@/lib/hooks';
import type { SessionItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { useErrorMessage } from '@/components/providers';

/**
 * Book / waitlist / cancel controls for one session. Eligibility and capacity are decided by
 * the API; this component only reflects the result and refreshes the schedule.
 */
export function BookingActions({
  session,
  size = 'sm',
  onChanged,
}: {
  session: SessionItem;
  size?: 'sm' | 'md';
  onChanged?: () => void;
}) {
  const t = useTranslations('booking');
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const now = useNow();
  const freeCancelHours = usePublicSettings().data?.bookingPolicy.freeCancellationHours ?? 0;
  const message = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['sessions'] });
    await qc.invalidateQueries({ queryKey: ['my-bookings'] });
    onChanged?.();
  };

  const run = async (fn: () => Promise<unknown>, success: string) => {
    if (!me) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      await refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_ELIGIBLE' && error.details?.reason === 'NO_MEMBERSHIP') {
        toast.error(message(error), {
          action: { label: t('getMembership'), onClick: () => router.push('/memberships') },
        });
      } else toast.error(message(error));
    } finally {
      setBusy(false);
    }
  };

  if (session.status === 'CANCELLED')
    return <span className="text-xs font-semibold text-danger">{t('cancelled')}</span>;
  const started = new Date(session.startsAt).getTime() <= now;
  if (started) return <span className="text-xs text-muted">{t('started')}</span>;

  const booked = session.myBooking?.status === 'CONFIRMED';
  if (booked) {
    const lateWindow = new Date(session.startsAt).getTime() - now < freeCancelHours * 3_600_000;
    return (
      <>
        <Button size={size} variant="outline" onClick={() => setConfirmCancel(true)} loading={busy}>
          {t('cancel')}
        </Button>
        <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <DialogContent size="sm">
            <DialogHeader title={t('cancelTitle')} description={lateWindow ? t('lateWarning') : t('cancelBody')} />
            <DialogBody className="py-2" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                {t('keep')}
              </Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={async () => {
                  await run(() => api.post(`/me/bookings/${session.myBooking!.id}/cancel`), t('cancelledToast'));
                  setConfirmCancel(false);
                }}
              >
                {t('confirmCancel')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  if (session.myWaitlist) {
    return (
      <Button
        size={size}
        variant="ghost"
        loading={busy}
        onClick={() => run(() => api.post(`/me/waitlist/${session.myWaitlist!.id}/leave`), t('leftWaitlist'))}
      >
        {t('leaveWaitlist')}
      </Button>
    );
  }
  if (session.spotsLeft === 0) {
    return (
      <Button
        size={size}
        variant="outline"
        loading={busy}
        onClick={() => run(() => api.post('/me/waitlist', { sessionId: session.id }), t('joinedWaitlist'))}
      >
        {t('joinWaitlist')}
      </Button>
    );
  }
  return (
    <Button
      size={size}
      loading={busy}
      onClick={() => run(() => api.post('/me/bookings', { sessionId: session.id }), t('booked'))}
    >
      {t('book')}
    </Button>
  );
}
