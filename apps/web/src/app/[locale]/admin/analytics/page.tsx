'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Info } from 'lucide-react';
import type { LocalizedText } from '@fitclub/shared';
import { api, qs } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import { Card, CardHeader, EmptyState, Skeleton, Stat, Table, Td, Th } from '@/components/ui/display';
import { AdminPage } from '@/components/admin/kit';
import { defaultRange, RangePicker } from '@/components/admin/range';

interface Reports {
  revenue: {
    totals: { gross: number; refunded: number; net: number; payments: number };
    series: { date: string; amount: number }[];
    byMethod: { method: string; amount: number; count: number }[];
  } | null;
  membershipSales: { plan: { name: LocalizedText; code: string } | null; count: number; amount: number | null }[];
  membershipStatus: Record<string, number>;
  renewal: { renewed: number; expired: number; rate: number | null };
  acquisition: { week: string; count: number }[];
  utilization: {
    sessions: number;
    seats: number;
    capacity: number;
    rate: number | null;
    heatmap: { seats: number; capacity: number }[][];
  };
  attendance: {
    attended: number;
    noShow: number;
    lateCancelled: number;
    cancelled: number;
    rate: number | null;
    checkIns: { date: string; count: number }[];
  };
  classPopularity: {
    name: LocalizedText;
    slug: string;
    sessions: number;
    seats: number;
    capacity: number;
    fillRate: number | null;
  }[];
  leads: {
    total: number;
    won: number;
    lost: number;
    conversionRate: number | null;
    bySource: Record<string, { total: number; won: number }>;
    byStatus: Record<string, number>;
  };
  definitions: Record<string, string>;
}

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
const tooltip = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 },
};

export default function AnalyticsPage() {
  const t = useTranslations('admin.analytics');
  const enums = useTranslations('enums');
  const days = useTranslations('weekdays');
  const fmt = useFmt();
  const can = useCan();
  const [range, setRange] = useState(defaultRange(90));
  const { data, isLoading } = useQuery({
    queryKey: ['admin-reports', range],
    queryFn: () => api.get<Reports>(`/admin/analytics/reports${qs(range)}`),
    placeholderData: keepPreviousData,
  });

  return (
    <AdminPage
      title={t('title')}
      description={t('lead')}
      actions={<RangePicker value={range} onChange={setRange} showTest={can('analytics.finance')} />}
    >
      {isLoading || !data ? (
        <Skeleton className="h-[640px]" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label={t('netRevenue')}
              value={data.revenue ? fmt.money(data.revenue.totals.net) : '—'}
              hint={data.revenue ? t('refunds', { amount: fmt.money(data.revenue.totals.refunded) }) : t('noAccess')}
            />
            <Stat
              label={t('renewalRate')}
              value={fmt.percent(data.renewal.rate)}
              hint={t('renewalHint', { renewed: data.renewal.renewed, expired: data.renewal.expired })}
            />
            <Stat
              label={t('utilization')}
              value={fmt.percent(data.utilization.rate)}
              hint={t('utilizationHint', { seats: data.utilization.seats, capacity: data.utilization.capacity })}
            />
            <Stat
              label={t('conversion')}
              value={fmt.percent(data.leads.conversionRate)}
              hint={t('conversionHint', { won: data.leads.won, total: data.leads.total })}
            />
          </div>

          {data.revenue && (
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
              <Card>
                <CardHeader title={t('revenueByDay')} />
                <div className="h-72 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.revenue.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v: string) => v.slice(5)}
                        stroke="var(--muted)"
                        fontSize={11}
                        minTickGap={20}
                      />
                      <YAxis
                        stroke="var(--muted)"
                        fontSize={11}
                        width={60}
                        tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                      />
                      <Tooltip
                        {...tooltip}
                        formatter={(v) => fmt.money(Number(v))}
                        labelFormatter={(l) => fmt.date(String(l))}
                      />
                      <Bar dataKey="amount" name={t('revenue')} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title={t('byMethod')} />
                <div className="h-72 p-4">
                  {data.revenue.byMethod.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.revenue.byMethod.map((m) => ({ ...m, label: enums(`paymentMethod.${m.method}`) }))}
                          dataKey="amount"
                          nameKey="label"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {data.revenue.byMethod.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...tooltip} formatter={(v) => fmt.money(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState title={t('noData')} />
                  )}
                </div>
                <ul className="space-y-1 px-5 pb-5 text-sm">
                  {data.revenue.byMethod.map((m, i) => (
                    <li key={m.method} className="flex justify-between">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{' '}
                        {enums(`paymentMethod.${m.method}`)}
                      </span>
                      <span className="tabular-nums">{fmt.money(m.amount)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title={t('membershipSales')} />
              {!data.membershipSales.length ? (
                <EmptyState title={t('noData')} />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('plan')}</Th>
                      <Th className="text-right">{t('sold')}</Th>
                      {data.revenue && <Th className="text-right">{t('value')}</Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.membershipSales.map((s, i) => (
                      <tr key={i}>
                        <Td>{s.plan ? fmt.t(s.plan.name) : '—'}</Td>
                        <Td className="text-right tabular-nums">{s.count}</Td>
                        {data.revenue && (
                          <Td className="text-right tabular-nums">{s.amount !== null ? fmt.money(s.amount) : '—'}</Td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
            <Card>
              <CardHeader title={t('statusBreakdown')} />
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
                {['ACTIVE', 'FROZEN', 'PENDING', 'EXPIRED', 'CANCELLED'].map((s) => (
                  <div key={s} className="bg-surface p-4">
                    <p className="text-xs text-muted">{enums(`membershipStatus.${s}`)}</p>
                    <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                      {data.membershipStatus[s] ?? 0}
                    </p>
                  </div>
                ))}
              </div>
              <div className="h-48 p-4">
                <p className="mb-2 text-xs font-medium text-muted">{t('newCustomers')}</p>
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart data={data.acquisition}>
                    <XAxis
                      dataKey="week"
                      tickFormatter={(v: string) => v.slice(5)}
                      stroke="var(--muted)"
                      fontSize={11}
                    />
                    <YAxis allowDecimals={false} stroke="var(--muted)" fontSize={11} width={30} />
                    <Tooltip {...tooltip} />
                    <Line
                      dataKey="count"
                      name={t('newCustomers')}
                      stroke="var(--chart-2)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title={t('popularity')} />
              <Table>
                <thead>
                  <tr>
                    <Th>{t('class')}</Th>
                    <Th className="text-right">{t('sessions')}</Th>
                    <Th className="text-right">{t('seats')}</Th>
                    <Th className="text-right">{t('fill')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.classPopularity.map((c) => (
                    <tr key={c.slug}>
                      <Td className="font-medium">{fmt.t(c.name)}</Td>
                      <Td className="text-right tabular-nums">{c.sessions}</Td>
                      <Td className="text-right tabular-nums">{c.seats}</Td>
                      <Td className="text-right tabular-nums">{fmt.percent(c.fillRate)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card>
              <CardHeader
                title={t('attendance')}
                description={t('attendanceLead', { rate: fmt.percent(data.attendance.rate) })}
              />
              <div className="grid grid-cols-4 gap-px bg-border">
                {(
                  [
                    ['attended', data.attendance.attended],
                    ['noShow', data.attendance.noShow],
                    ['lateCancelled', data.attendance.lateCancelled],
                    ['cancelled', data.attendance.cancelled],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="bg-surface p-4">
                    <p className="text-xs text-muted">{t(k)}</p>
                    <p className="mt-1 font-display text-xl font-semibold tabular-nums">{v}</p>
                  </div>
                ))}
              </div>
              <div className="h-48 p-4">
                <p className="mb-2 text-xs font-medium text-muted">{t('checkIns')}</p>
                <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={data.attendance.checkIns}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => v.slice(5)}
                      stroke="var(--muted)"
                      fontSize={11}
                      minTickGap={16}
                    />
                    <YAxis allowDecimals={false} stroke="var(--muted)" fontSize={11} width={30} />
                    <Tooltip {...tooltip} labelFormatter={(l) => fmt.date(String(l))} />
                    <Bar dataKey="count" name={t('checkIns')} fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title={t('heatmap')} description={t('heatmapLead')} />
            <div className="overflow-x-auto p-4">
              <table className="text-[0.65rem]">
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: 18 }, (_, h) => (
                      <th key={h} className="px-0.5 font-normal text-muted">
                        {h + 6}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.utilization.heatmap.map((row, d) => (
                    <tr key={d}>
                      <td className="pr-2 text-muted">{days(String(d))}</td>
                      {row.slice(6, 24).map((cell, h) => {
                        const rate = cell.capacity ? cell.seats / cell.capacity : null;
                        return (
                          <td key={h} className="p-0.5">
                            <div
                              className="size-6 rounded"
                              title={
                                rate === null ? '—' : `${Math.round(rate * 100)}% (${cell.seats}/${cell.capacity})`
                              }
                              style={{
                                background:
                                  rate === null
                                    ? 'var(--surface-2)'
                                    : `color-mix(in srgb, var(--chart-1) ${Math.round(15 + rate * 85)}%, transparent)`,
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('leadsBySource')} />
            <Table>
              <thead>
                <tr>
                  <Th>{t('source')}</Th>
                  <Th className="text-right">{t('leads')}</Th>
                  <Th className="text-right">{t('won')}</Th>
                  <Th className="text-right">{t('rate')}</Th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.leads.bySource).map(([source, v]) => (
                  <tr key={source}>
                    <Td>{enums(`leadSource.${source}`)}</Td>
                    <Td className="text-right tabular-nums">{v.total}</Td>
                    <Td className="text-right tabular-nums">{v.won}</Td>
                    <Td className="text-right tabular-nums">{fmt.percent(v.total ? v.won / v.total : null)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <details className="rounded-xl border border-border bg-surface p-5 text-sm">
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
        </div>
      )}
    </AdminPage>
  );
}
