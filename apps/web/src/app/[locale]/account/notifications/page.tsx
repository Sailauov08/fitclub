'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { BellOff, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/display';
import { PageTitle } from '@/components/account/shell';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const t = useTranslations('account.notifications');
  const fmt = useFmt();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api.get<{
        unread: number;
        items: { id: string; type: string; title: string; body: string; createdAt: string; readAt: string | null }[];
      }>('/me/notifications'),
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/me/notifications/read', { ids: 'all' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api.post('/me/notifications/read', { ids: [id] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <>
      <PageTitle
        title={t('title')}
        description={data ? t('unread', { count: data.unread }) : undefined}
        action={
          data?.unread ? (
            <Button variant="outline" onClick={() => markAll.mutate()} loading={markAll.isPending}>
              <CheckCheck /> {t('markAll')}
            </Button>
          ) : undefined
        }
      />
      <Card>
        {isLoading ? (
          <Skeleton className="m-5 h-40" />
        ) : !data?.items.length ? (
          <EmptyState icon={<BellOff />} title={t('none')} />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.readAt && markOne.mutate(n.id)}
                  className={cn(
                    'flex w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/60',
                    !n.readAt && 'bg-primary/[0.04]',
                  )}
                >
                  <span
                    className={cn('mt-2 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{n.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{fmt.relative(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
