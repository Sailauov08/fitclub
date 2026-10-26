'use client';

import { Suspense } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { AdminPage, Pagination, SearchInput } from '@/components/admin/kit';
import { useUrlState } from '@/components/admin/hooks';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: {
    email: string;
    profile: { firstName: string; lastName: string } | null;
    staff: { role: string } | null;
  } | null;
}

const DEFAULTS = { q: '', action: '', page: '1' };

function AuditList() {
  const t = useTranslations('admin.audit');
  const roles = useTranslations('enums.role');
  const fmt = useFmt();
  const [f, set] = useUrlState(DEFAULTS);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit', f],
    queryFn: () =>
      api.get<{ items: AuditRow[]; total: number; page: number; pageSize: number }>(
        `/admin/audit${qs({ ...f, pageSize: 50 })}`,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <AdminPage title={t('title')} description={t('lead')}>
      <Card>
        <div className="border-b border-border p-4">
          <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder={t('search')} className="max-w-md" />
        </div>
        {isLoading ? (
          <Skeleton className="m-4 h-64" />
        ) : !data?.items.length ? (
          <EmptyState icon={<ShieldCheck />} title={t('empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('when')}</Th>
                <Th>{t('actor')}</Th>
                <Th>{t('action')}</Th>
                <Th>{t('entity')}</Th>
                <Th>{t('details')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap text-sm text-muted">{fmt.dateTime(a.createdAt)}</Td>
                  <Td className="text-sm">
                    {a.actor
                      ? a.actor.profile
                        ? `${a.actor.profile.firstName} ${a.actor.profile.lastName}`
                        : a.actor.email
                      : t('system')}
                    {a.actor?.staff && <Badge className="ml-2">{roles(a.actor.staff.role)}</Badge>}
                  </Td>
                  <Td>
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{a.action}</code>
                  </Td>
                  <Td className="text-xs text-muted">
                    {a.entityType}
                    {a.entityId && <span className="block font-mono">{a.entityId.slice(0, 12)}</span>}
                  </Td>
                  <Td className="max-w-sm">
                    {a.metadata && (
                      <pre className="max-h-20 overflow-auto whitespace-pre-wrap break-all font-mono text-[0.7rem] text-muted">
                        {JSON.stringify(a.metadata)}
                      </pre>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={(p) => set({ page: String(p) })}
          />
        )}
      </Card>
    </AdminPage>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AuditList />
    </Suspense>
  );
}
