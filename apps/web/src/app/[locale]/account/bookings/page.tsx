'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton, type Tone } from '@/components/ui/display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { useErrorMessage } from '@/components/providers';
import { PageTitle } from '@/components/account/shell';

interface Row {
  id: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'LATE_CANCELLED' | 'ATTENDED' | 'NO_SHOW';
  fromWaitlist: boolean;
  session: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    classType: { name: LocalizedText };
    trainer: { displayName: string };
    branch: { name: LocalizedText };
    room: { name: LocalizedText };
  };
}
const TONE: Record<Row['status'], Tone> = {
  CONFIRMED: 'success',
  CANCELLED: 'neutral',
  LATE_CANCELLED: 'warning',
  ATTENDED: 'info',
  NO_SHOW: 'danger',
};

export default function MyBookingsPage() {
  const t = useTranslations('account.bookings');
  const enums = useTranslations('enums.bookingStatus');
  const fmt = useFmt();
  const qc = useQueryClient();
  const message = useErrorMessage();
  const upcoming = useQuery({
    queryKey: ['my-bookings', 'upcoming'],
    queryFn: () =>
      api.get<{ bookings: Row[]; waitlist: { id: string; position: number; session: Row['session'] }[] }>(
        '/me/bookings',
      ),
  });
  const history = useQuery({
    queryKey: ['my-bookings', 'history'],
    queryFn: () => api.get<{ bookings: Row[] }>('/me/bookings/history'),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post<{ late: boolean }>(`/me/bookings/${id}/cancel`),
    onSuccess: (res) => {
      toast.success(res.late ? t('cancelledLate') : t('cancelled'));
      void qc.invalidateQueries({ queryKey: ['my-bookings'] });
    },
    onError: (e) => toast.error(message(e)),
  });
  const leave = useMutation({
    mutationFn: (id: string) => api.post(`/me/waitlist/${id}/leave`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-bookings'] }),
    onError: (e) => toast.error(message(e)),
  });

  const SessionLine = ({ s }: { s: Row['session'] }) => (
    <div className="flex min-w-0 items-center gap-4">
      <div className="w-24 shrink-0">
        <p className="font-display font-semibold tabular-nums">{fmt.time(s.startsAt)}</p>
        <p className="text-xs text-muted">{fmt.date(s.startsAt)}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold">{fmt.t(s.classType.name)}</p>
        <p className="truncate text-sm text-muted">
          {s.trainer.displayName} · {fmt.t(s.branch.name)} · {fmt.t(s.room.name)}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <PageTitle
        title={t('title')}
        description={t('lead')}
        action={
          <Button asChild>
            <Link href="/schedule">{t('book')}</Link>
          </Button>
        }
      />
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">{t('upcoming')}</TabsTrigger>
          <TabsTrigger value="history">{t('history')}</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="space-y-6">
          <Card>
            {upcoming.isLoading ? (
              <Skeleton className="m-5 h-32" />
            ) : !upcoming.data?.bookings.length ? (
              <EmptyState
                icon={<CalendarDays />}
                title={t('noUpcoming')}
                action={
                  <Button asChild variant="outline">
                    <Link href="/schedule">{t('book')}</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.data.bookings.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <SessionLine s={b.session} />
                    <div className="flex items-center gap-3">
                      {b.fromWaitlist && <Badge tone="info">{t('fromWaitlist')}</Badge>}
                      <Button
                        size="sm"
                        variant="outline"
                        loading={cancel.isPending && cancel.variables === b.id}
                        onClick={() => cancel.mutate(b.id)}
                      >
                        {t('cancel')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {Boolean(upcoming.data?.waitlist.length) && (
            <Card>
              <p className="border-b border-border px-5 py-3 text-sm font-semibold">{t('waitlist')}</p>
              <ul className="divide-y divide-border">
                {upcoming.data!.waitlist.map((w) => (
                  <li
                    key={w.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <SessionLine s={w.session} />
                    <div className="flex items-center gap-3">
                      <Badge tone="warning">{t('position', { position: w.position })}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => leave.mutate(w.id)}>
                        {t('leave')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="history">
          <Card>
            {history.isLoading ? (
              <Skeleton className="m-5 h-32" />
            ) : !history.data?.bookings.length ? (
              <EmptyState title={t('noHistory')} />
            ) : (
              <ul className="divide-y divide-border">
                {history.data.bookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-4">
                    <SessionLine s={b.session} />
                    <Badge tone={TONE[b.status]}>{enums(b.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
