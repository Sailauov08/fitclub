'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { addDaysToKey, localDateKey } from '@fitclub/shared';
import { api, qs } from '@/lib/api';
import { useFmt } from '@/lib/format';
import type { SessionItem } from '@/lib/types';
import { Skeleton } from '@/components/ui/display';
import { cn } from '@/lib/utils';
import { BookingActions } from './booking-actions';

/** Next two weeks of sessions for a class type or a trainer, with live booking state. */
export function UpcomingSessions({
  classTypeId,
  trainerId,
  className,
}: {
  classTypeId?: string;
  trainerId?: string;
  className?: string;
}) {
  const t = useTranslations('schedule');
  const fmt = useFmt();
  const from = localDateKey(new Date());
  const { data, isLoading } = useQuery({
    queryKey: ['sessions', 'upcoming', classTypeId, trainerId],
    queryFn: () =>
      api.get<{ sessions: SessionItem[] }>(
        `/classes/sessions${qs({ from, to: addDaysToKey(from, 13), classTypeId, trainerId })}`,
      ),
  });
  const sessions = (data?.sessions ?? [])
    .filter((s) => s.status === 'SCHEDULED' && new Date(s.startsAt) > new Date())
    .slice(0, 8);

  if (isLoading) return <Skeleton className={cn('h-48', className)} />;
  if (sessions.length === 0) return <p className={cn('text-sm text-muted', className)}>{t('noUpcoming')}</p>;
  return (
    <ul className={cn('divide-y divide-border rounded-xl border border-border bg-surface', className)}>
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="font-semibold">{fmt.dateTime(s.startsAt)}</p>
            <p className="truncate text-sm text-muted">
              {trainerId ? fmt.t(s.classType.name) : s.trainer.displayName} · {fmt.t(s.branch.name)}
            </p>
            <p className={cn('text-xs', s.spotsLeft === 0 ? 'text-danger' : 'text-muted')}>
              {s.spotsLeft === 0 ? t('full') : t('spotsLeft', { count: s.spotsLeft })}
            </p>
          </div>
          <BookingActions session={s} />
        </li>
      ))}
    </ul>
  );
}
