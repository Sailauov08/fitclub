'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowRight, CalendarDays, CheckCircle2, MailWarning, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import type { MembershipRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/display';
import { PageTitle } from '@/components/account/shell';
import { CheckInPass, MembershipCard } from '@/components/account/membership-ui';

interface BookingRow {
  id: string;
  status: string;
  session: {
    id: string;
    startsAt: string;
    classType: { name: { kk: string; ru: string; en: string } };
    trainer: { displayName: string };
    branch: { name: { kk: string; ru: string; en: string } };
    room: { name: { kk: string; ru: string; en: string } };
  };
}

export default function AccountOverview() {
  const t = useTranslations('account.overview');
  const fmt = useFmt();
  const { data: me } = useMe();
  const memberships = useQuery({
    queryKey: ['my-memberships'],
    queryFn: () => api.get<MembershipRow[]>('/me/memberships'),
  });
  const bookings = useQuery({
    queryKey: ['my-bookings', 'upcoming'],
    queryFn: () => api.get<{ bookings: BookingRow[] }>('/me/bookings'),
  });
  const visits = useQuery({
    queryKey: ['my-visits'],
    queryFn: () =>
      api.get<{ items: { id: string; createdAt: string; branch: { name: { kk: string; ru: string; en: string } } }[] }>(
        '/me/visits',
      ),
  });
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api.get<{
        unread: number;
        items: { id: string; title: string; body: string; createdAt: string; readAt: string | null }[];
      }>('/me/notifications'),
  });

  const current =
    memberships.data?.find((m) => m.status === 'ACTIVE') ??
    memberships.data?.find((m) => m.status === 'FROZEN') ??
    memberships.data?.find((m) => m.status === 'PENDING');

  return (
    <>
      <PageTitle
        title={t('greeting', { name: me?.profile?.firstName ?? '' })}
        description={t('lead')}
        action={current?.status === 'ACTIVE' ? <CheckInPass /> : undefined}
      />
      {me && !me.emailVerified && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          <MailWarning className="size-4" />
          <span className="flex-1">{t('verifyEmail')}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await api.post('/auth/resend-verification').catch(() => undefined);
              toast.success(t('verificationSent'));
            }}
          >
            {t('resend')}
          </Button>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        {memberships.isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : current ? (
          <MembershipCard membership={current} />
        ) : (
          <Card className="flex flex-col items-start justify-center gap-4 p-8">
            <Sparkles className="size-6 text-primary" />
            <p className="text-lg font-semibold">{t('noMembershipTitle')}</p>
            <p className="text-muted">{t('noMembershipBody')}</p>
            <Button asChild>
              <Link href="/memberships">
                {t('choosePlan')} <ArrowRight />
              </Link>
            </Button>
          </Card>
        )}
        <Card>
          <CardHeader
            title={t('notifications')}
            action={
              <Link href="/account/notifications" className="text-sm font-medium text-primary">
                {t('all')}
              </Link>
            }
          />
          {notifications.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : !notifications.data?.items.length ? (
            <EmptyState title={t('noNotifications')} />
          ) : (
            <ul className="divide-y divide-border">
              {notifications.data.items.slice(0, 4).map((n) => (
                <li key={n.id} className="px-5 py-3.5">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {!n.readAt && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{fmt.relative(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader
            title={t('upcoming')}
            action={
              <Link href="/schedule" className="text-sm font-medium text-primary">
                {t('bookMore')}
              </Link>
            }
          />
          {bookings.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : !bookings.data?.bookings.length ? (
            <EmptyState
              icon={<CalendarDays />}
              title={t('noUpcoming')}
              action={
                <Button asChild variant="outline">
                  <Link href="/schedule">{t('openSchedule')}</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {bookings.data.bookings.slice(0, 5).map((b) => (
                <li key={b.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-24 shrink-0">
                    <p className="font-display font-semibold tabular-nums">{fmt.time(b.session.startsAt)}</p>
                    <p className="text-xs text-muted">{fmt.date(b.session.startsAt)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{fmt.t(b.session.classType.name)}</p>
                    <p className="truncate text-sm text-muted">
                      {b.session.trainer.displayName} · {fmt.t(b.session.branch.name)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t('recentVisits')} />
          {visits.isLoading ? (
            <Skeleton className="m-5 h-24" />
          ) : !visits.data?.items.length ? (
            <EmptyState title={t('noVisits')} />
          ) : (
            <ul className="divide-y divide-border">
              {visits.data.items.slice(0, 6).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-success" /> {fmt.t(v.branch.name)}
                  </span>
                  <span className="text-muted">{fmt.dateTime(v.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
