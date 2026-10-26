'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CalendarX2, ChevronLeft, ChevronRight, MapPin, User } from 'lucide-react';
import { addDaysToKey, localDateKey, localWeekday, zonedDateTime, type LocalizedText } from '@fitclub/shared';
import { api, qs } from '@/lib/api';
import { useFmt } from '@/lib/format';
import type { SessionItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Badge, EmptyState, Skeleton } from '@/components/ui/display';
import { cn } from '@/lib/utils';
import { BookingActions } from './booking-actions';

interface Filters {
  branchId?: string;
  categoryId?: string;
  difficulty?: string;
  classTypeId?: string;
  trainerId?: string;
}

function weekStart(key: string) {
  const wd = localWeekday(zonedDateTime(key, 12 * 60));
  return addDaysToKey(key, -wd);
}

/** Public weekly timetable with filters. Members see their booking state on each class. */
export function ScheduleBoard({
  branches,
  categories,
  initial = {},
  compact,
}: {
  branches: { id: string; name: LocalizedText }[];
  categories: { id: string; name: LocalizedText }[];
  initial?: Filters;
  compact?: boolean;
}) {
  const t = useTranslations('schedule');
  const classesT = useTranslations('classes');
  const fmt = useFmt();
  const today = localDateKey(new Date());
  const [start, setStart] = useState(weekStart(today));
  const [filters, setFilters] = useState<Filters>(initial);
  const end = addDaysToKey(start, 6);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['sessions', start, filters],
    queryFn: () => api.get<{ sessions: SessionItem[] }>(`/classes/sessions${qs({ from: start, to: end, ...filters })}`),
    placeholderData: keepPreviousData,
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i)), [start]);
  const byDay = useMemo(() => {
    const map = new Map<string, SessionItem[]>();
    for (const s of data?.sessions ?? []) {
      const key = localDateKey(new Date(s.startsAt));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [data]);

  const set = (key: keyof Filters, value: string) => setFilters((f) => ({ ...f, [key]: value || undefined }));
  const canGoBack = start > weekStart(today);

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setStart(addDaysToKey(start, -7))}
            disabled={!canGoBack}
            aria-label={t('prevWeek')}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setStart(addDaysToKey(start, 7))}
            aria-label={t('nextWeek')}
          >
            <ChevronRight />
          </Button>
          <p className="ml-2 text-sm font-semibold" aria-live="polite">
            {fmt.date(zonedDateTime(start, 12 * 60))} — {fmt.date(zonedDateTime(end, 12 * 60))}
          </p>
          {start !== weekStart(today) && (
            <Button variant="link" size="sm" onClick={() => setStart(weekStart(today))}>
              {t('thisWeek')}
            </Button>
          )}
        </div>
        {!compact && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select
              aria-label={t('branch')}
              value={filters.branchId ?? ''}
              onChange={(e) => set('branchId', e.target.value)}
            >
              <option value="">{t('allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {fmt.t(b.name)}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t('category')}
              value={filters.categoryId ?? ''}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              <option value="">{t('allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {fmt.t(c.name)}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t('level')}
              value={filters.difficulty ?? ''}
              onChange={(e) => set('difficulty', e.target.value)}
            >
              <option value="">{t('allLevels')}</option>
              {(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS'] as const).map((d) => (
                <option key={d} value={d}>
                  {classesT(`difficulty.${d}`)}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {isError ? (
        <EmptyState
          icon={<CalendarX2 />}
          title={t('loadError')}
          action={<Button onClick={() => refetch()}>{t('retry')}</Button>}
        />
      ) : (
        <div className={cn('mt-8 space-y-8 transition-opacity', isFetching && !isLoading && 'opacity-60')}>
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            const date = zonedDateTime(day, 12 * 60);
            return (
              <section
                key={day}
                aria-labelledby={`day-${day}`}
                className="grid gap-4 border-t border-border pt-6 md:grid-cols-[180px_1fr]"
              >
                <div id={`day-${day}`}>
                  <p className={cn('font-display text-lg font-semibold capitalize', day === today && 'text-primary')}>
                    {fmt.weekday(date)}
                  </p>
                  <p className="text-sm text-muted">{fmt.date(date)}</p>
                </div>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                  </div>
                ) : list.length === 0 ? (
                  <p className="py-4 text-sm text-muted">{t('noClasses')}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                    {list.map((s) => (
                      <li
                        key={s.id}
                        className={cn(
                          'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6',
                          s.status === 'CANCELLED' && 'opacity-60',
                        )}
                      >
                        <div className="w-24 shrink-0">
                          <p className="font-display text-lg font-semibold tabular-nums">{fmt.time(s.startsAt)}</p>
                          <p className="text-xs text-muted">
                            {classesT('minutes', {
                              count: Math.round(
                                (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60000,
                              ),
                            })}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            {fmt.t(s.classType.name)}
                            {s.status === 'CANCELLED' && (
                              <Badge tone="danger" className="ml-2 align-middle">
                                {t('cancelled')}
                              </Badge>
                            )}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                            <span className="inline-flex items-center gap-1">
                              <User className="size-3.5" /> {s.trainer.displayName}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" /> {fmt.t(s.branch.name)} · {fmt.t(s.room.name)}
                            </span>
                            <span>{classesT(`difficulty.${s.classType.difficulty}`)}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-4 sm:justify-end">
                          <span
                            className={cn(
                              'text-xs font-medium tabular-nums',
                              s.spotsLeft === 0 ? 'text-danger' : s.spotsLeft <= 3 ? 'text-warning' : 'text-muted',
                            )}
                          >
                            {s.spotsLeft === 0 ? t('full') : t('spotsLeft', { count: s.spotsLeft })}
                          </span>
                          {s.myBooking?.status === 'CONFIRMED' && <Badge tone="success">{t('youreIn')}</Badge>}
                          {s.myWaitlist && <Badge tone="warning">{t('waitlisted')}</Badge>}
                          <BookingActions session={s} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
