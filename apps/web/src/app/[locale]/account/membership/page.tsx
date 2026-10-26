'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { RefreshCcw, Snowflake, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { addDaysToKey, localDateKey } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { usePublicSettings } from '@/lib/hooks';
import type { MembershipRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { useErrorMessage } from '@/components/providers';
import { PageTitle } from '@/components/account/shell';
import { MembershipCard, MembershipStatusBadge } from '@/components/account/membership-ui';

export default function MyMembershipPage() {
  const t = useTranslations('account.membership');
  const fmt = useFmt();
  const qc = useQueryClient();
  const message = useErrorMessage();
  const { data, isLoading } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: () => api.get<MembershipRow[]>('/me/memberships'),
  });
  const settings = usePublicSettings();
  const [freezeFor, setFreezeFor] = useState<MembershipRow | null>(null);
  const today = localDateKey(new Date());
  const [start, setStart] = useState(today);
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['my-memberships'] });
  const freeze = useMutation({
    mutationFn: () =>
      api.post(`/me/memberships/${freezeFor!.id}/freeze`, { startDate: start, days, reason: reason || undefined }),
    onSuccess: async () => {
      toast.success(t('freezeScheduled'));
      setFreezeFor(null);
      await refresh();
    },
    onError: (e) => toast.error(message(e)),
  });
  const action = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: (e) => toast.error(message(e)),
  });
  const renew = async (m: MembershipRow) => {
    try {
      const res = await api.post<{ redirectUrl: string | null; paymentId: string }>(
        `/me/memberships/${m.id}/renew`,
        {},
      );
      if (res.redirectUrl) window.location.assign(res.redirectUrl);
    } catch (e) {
      toast.error(message(e));
    }
  };

  if (isLoading) return <Skeleton className="h-96" />;
  const list = data ?? [];
  const current =
    list.find((m) => m.status === 'ACTIVE') ??
    list.find((m) => m.status === 'FROZEN') ??
    list.find((m) => m.status === 'PENDING');
  const selfFreeze = settings.data?.membershipPolicy.memberSelfFreeze ?? false;
  const minDays = settings.data?.membershipPolicy.minFreezeDays ?? 7;

  return (
    <>
      <PageTitle title={t('title')} description={t('lead')} />
      {!current ? (
        <Card>
          <EmptyState
            icon={<Sparkles />}
            title={t('none')}
            description={t('noneBody')}
            action={
              <Button asChild>
                <Link href="/memberships">{t('choosePlan')}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <MembershipCard membership={current} />
          <Card className="p-6">
            <p className="font-semibold">{t('manage')}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted">{t('started')}</dt>
              <dd>{fmt.date(current.startsAt)}</dd>
              <dt className="text-muted">{t('freezeLeft')}</dt>
              <dd>
                {t('freezeDays', {
                  left: Math.max(0, current.freezeMaxDays - current.frozenDaysUsed),
                  total: current.freezeMaxDays,
                })}
              </dd>
              <dt className="text-muted">{t('paid')}</dt>
              <dd>{fmt.money(current.price)}</dd>
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              {current.status !== 'PENDING' && (
                <Button onClick={() => renew(current)}>
                  <RefreshCcw /> {t('renew')}
                </Button>
              )}
              {current.status === 'ACTIVE' && current.freezeMaxDays > 0 && selfFreeze && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDays(minDays);
                    setStart(today);
                    setFreezeFor(current);
                  }}
                >
                  <Snowflake /> {t('freeze')}
                </Button>
              )}
              {current.status === 'FROZEN' && (
                <Button
                  variant="outline"
                  loading={action.isPending}
                  onClick={() => action.mutate(() => api.post(`/me/memberships/${current.id}/unfreeze`))}
                >
                  {t('unfreeze')}
                </Button>
              )}
            </div>
            {current.status === 'ACTIVE' && current.freezeMaxDays > 0 && !selfFreeze && (
              <p className="mt-4 text-xs text-muted">{t('freezeAtDesk')}</p>
            )}
            {current.freezes
              .filter((f) => f.status === 'SCHEDULED' || f.status === 'ACTIVE')
              .map((f) => (
                <div
                  key={f.id}
                  className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-info-soft px-3 py-2.5 text-sm text-info"
                >
                  <span>
                    <Snowflake className="mr-1.5 inline size-4" />
                    {t('freezeRange', {
                      from: fmt.date(f.startDate),
                      to: fmt.date(new Date(new Date(f.endDate).getTime() - 86_400_000)),
                    })}
                  </span>
                  {f.status === 'SCHEDULED' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => action.mutate(() => api.post(`/me/memberships/freezes/${f.id}/cancel`))}
                    >
                      {t('cancelFreeze')}
                    </Button>
                  )}
                </div>
              ))}
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title={t('history')} />
        {list.length === 0 ? (
          <EmptyState title={t('noHistory')} />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((m) => (
              <li key={m.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{fmt.t(m.planSnapshot.name)}</p>
                    <p className="text-sm text-muted">
                      {fmt.date(m.startsAt)} — {fmt.lastDay(m.endsAt)} · {fmt.money(m.price)}
                    </p>
                  </div>
                  <MembershipStatusBadge status={m.status} />
                </div>
                {m.events.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-muted">{t('timeline')}</summary>
                    <ol className="mt-3 space-y-1.5 border-l border-border pl-4">
                      {m.events.map((e) => (
                        <li key={e.id} className="flex justify-between gap-4">
                          <span>
                            <Badge tone="neutral">{t(`events.${e.type}`)}</Badge>
                          </span>
                          <span className="text-muted">{fmt.dateTime(e.createdAt)}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={Boolean(freezeFor)} onOpenChange={(o) => !o && setFreezeFor(null)}>
        <DialogContent size="sm">
          <DialogHeader title={t('freezeTitle')} description={t('freezeLead', { min: minDays })} />
          <DialogBody className="space-y-4">
            <Field label={t('freezeStart')}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={start}
                  min={today}
                  max={addDaysToKey(today, 30)}
                  onChange={(e) => setStart(e.target.value)}
                />
              )}
            </Field>
            <Field
              label={t('freezeLength')}
              hint={
                freezeFor
                  ? t('freezeDays', {
                      left: Math.max(0, freezeFor.freezeMaxDays - freezeFor.frozenDaysUsed),
                      total: freezeFor.freezeMaxDays,
                    })
                  : undefined
              }
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={minDays}
                  max={freezeFor?.freezeMaxDays ?? 30}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              )}
            </Field>
            <Field label={t('freezeReason')}>
              {(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
            <p className="text-xs text-muted">{t('freezeNote')}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFreezeFor(null)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => freeze.mutate()} loading={freeze.isPending}>
              {t('confirmFreeze')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
