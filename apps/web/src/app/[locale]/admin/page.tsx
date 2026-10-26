'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  Clock4,
  Info,
  Percent,
  ScanLine,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api';
import { useCan, useMe } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, Skeleton, Stat } from '@/components/ui/display';
import { AdminPage } from '@/components/admin/kit';
import { defaultRange, RangePicker } from '@/components/admin/range';

interface Overview {
  range: { from: string; to: string; includeTest: boolean };
  metrics: {
    totalMembers: number;
    activeMemberships: number;
    frozenMemberships: number;
    newMemberships: number;
    expiringSoon: number;
    todayCheckIns: number;
    upcomingClasses: number;
    occupancyToday: number | null;
    todaySessions: number;
  };
  finance: {
    revenue: { gross: number; refunded: number; net: number; payments: number };
    previousRevenue: { net: number };
    revenueTrend: { date: string; amount: number; count: number }[];
    testPaymentsInRange: number;
  } | null;
  pendingActions: { unassignedLeads: number; overdueTasks: number; stalePayments: number; expiringIn3Days: number };
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    actor: { email: string; profile: { firstName: string; lastName: string } | null } | null;
  }[];
  recentCheckIns: {
    id: string;
    createdAt: string;
    method: string;
    member: { id: string; user: { profile: { firstName: string; lastName: string } | null } };
    branch: { name: LocalizedText };
  }[];
  definitions: Record<string, string>;
}

export default function AdminOverview() {
  const t = useTranslations('admin.overview');
  const fmt = useFmt();
  const can = useCan();
  const { data: me } = useMe();
  const [range, setRange] = useState(defaultRange(30));
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview', range],
    queryFn: () => api.get<Overview>(`/admin/analytics/overview${qs(range)}`),
    placeholderData: keepPreviousData,
  });

  const m = data?.metrics;
  const delta =
    data?.finance && data.finance.previousRevenue.net > 0
      ? (data.finance.revenue.net - data.finance.previousRevenue.net) / data.finance.previousRevenue.net
      : null;

  return (
    <AdminPage
      title={t('title', { name: me?.profile?.firstName ?? '' })}
      description={t('lead')}
      actions={<RangePicker value={range} onChange={setRange} showTest={can('analytics.finance')} />}
    >
      {isLoading || !data || !m ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label={t('totalMembers')} value={fmt.number(m.totalMembers)} icon={<Users />} />
            <Stat
              label={t('activeMemberships')}
              value={fmt.number(m.activeMemberships)}
              hint={t('frozen', { count: m.frozenMemberships })}
              icon={<Activity />}
            />
            <Stat
              label={t('newMemberships')}
              value={fmt.number(m.newMemberships)}
              hint={t('inRange')}
              icon={<UserPlus />}
            />
            <Stat
              label={t('expiringSoon')}
              value={fmt.number(m.expiringSoon)}
              hint={t('next14')}
              icon={<CalendarClock />}
            />
            <Stat label={t('todayCheckIns')} value={fmt.number(m.todayCheckIns)} icon={<ScanLine />} />
            <Stat
              label={t('upcomingClasses')}
              value={fmt.number(m.upcomingClasses)}
              hint={t('next7')}
              icon={<Clock4 />}
            />
            <Stat
              label={t('occupancy')}
              value={fmt.percent(m.occupancyToday)}
              hint={t('sessionsToday', { count: m.todaySessions })}
              icon={<Percent />}
            />
            {data.finance ? (
              <Stat
                label={t('revenue')}
                value={fmt.money(data.finance.revenue.net)}
                hint={
                  <span>
                    {delta !== null && (
                      <span className={delta >= 0 ? 'text-success' : 'text-danger'}>
                        {delta >= 0 ? '▲' : '▼'} {fmt.percent(Math.abs(delta))}{' '}
                      </span>
                    )}
                    {t('vsPrevious')}
                  </span>
                }
                icon={<CircleDollarSign />}
              />
            ) : (
              <Stat label={t('revenue')} value="—" hint={t('noFinanceAccess')} icon={<CircleDollarSign />} />
            )}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader
                title={t('revenueTrend')}
                description={data.finance ? t('revenueTrendLead', { count: data.finance.revenue.payments }) : undefined}
                action={
                  data.finance && data.finance.testPaymentsInRange > 0 && data.range.includeTest ? (
                    <Badge tone="warning">{t('includesTest', { count: data.finance.testPaymentsInRange })}</Badge>
                  ) : undefined
                }
              />
              <div className="h-72 p-4">
                {data.finance ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.finance.revenueTrend} margin={{ left: 4, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v: string) => v.slice(5)}
                        stroke="var(--muted)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        stroke="var(--muted)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                        tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                      />
                      <Tooltip
                        formatter={(v) => fmt.money(Number(v))}
                        labelFormatter={(l) => fmt.date(String(l))}
                        contentStyle={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        name={t('revenue')}
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        fill="url(#rev)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title={t('noFinanceAccess')} />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title={t('pending')} />
              <ul className="divide-y divide-border text-sm">
                {[
                  {
                    key: 'unassignedLeads',
                    value: data.pendingActions.unassignedLeads,
                    href: '/admin/leads?assignedToId=none',
                    show: can('leads.read'),
                  },
                  {
                    key: 'overdueTasks',
                    value: data.pendingActions.overdueTasks,
                    href: '/admin/leads',
                    show: can('leads.read'),
                  },
                  {
                    key: 'expiringIn3Days',
                    value: data.pendingActions.expiringIn3Days,
                    href: '/admin/members?expiringWithinDays=3',
                    show: can('members.read'),
                  },
                  {
                    key: 'stalePayments',
                    value: data.pendingActions.stalePayments,
                    href: '/admin/payments?status=REQUIRES_ACTION',
                    show: can('payments.read'),
                  },
                ]
                  .filter((a) => a.show)
                  .map((a) => (
                    <li key={a.key}>
                      <Link
                        href={a.href}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-2/60"
                      >
                        <span className="inline-flex items-center gap-2">
                          {a.value > 0 ? (
                            <AlertTriangle className="size-4 text-warning" />
                          ) : (
                            <span className="size-4" />
                          )}
                          {t(`actions.${a.key}`)}
                        </span>
                        <Badge tone={a.value > 0 ? 'warning' : 'neutral'}>{a.value}</Badge>
                      </Link>
                    </li>
                  ))}
              </ul>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader
                title={t('recentCheckIns')}
                action={
                  can('checkin.perform') ? (
                    <Link href="/admin/checkin" className="text-sm font-medium text-primary">
                      {t('openReception')}
                    </Link>
                  ) : undefined
                }
              />
              {!data.recentCheckIns.length ? (
                <EmptyState title={t('noCheckIns')} />
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.recentCheckIns.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="font-medium">
                        {c.member.user.profile?.firstName} {c.member.user.profile?.lastName}
                      </span>
                      <span className="text-muted">
                        {fmt.t(c.branch.name)} · {fmt.relative(c.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader
                title={t('recentActivity')}
                action={
                  can('audit.read') ? (
                    <Link href="/admin/audit" className="text-sm font-medium text-primary">
                      {t('auditLog')}
                    </Link>
                  ) : undefined
                }
              />
              {!data.recentActivity.length ? (
                <EmptyState title={t('noActivity')} />
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.recentActivity.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="min-w-0 truncate">
                        <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{a.action}</code>{' '}
                        <span className="text-muted">
                          {a.actor?.profile
                            ? `${a.actor.profile.firstName} ${a.actor.profile.lastName}`
                            : (a.actor?.email ?? t('system'))}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">{fmt.relative(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <details className="mt-6 rounded-xl border border-border bg-surface p-5 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-medium">
              <Info className="size-4 text-muted" /> {t('definitions')}
            </summary>
            <dl className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(data.definitions).map(([key, formula]) => (
                <div key={key}>
                  <dt className="font-mono text-xs text-primary">{key}</dt>
                  <dd className="text-muted">{formula}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      )}
    </AdminPage>
  );
}
