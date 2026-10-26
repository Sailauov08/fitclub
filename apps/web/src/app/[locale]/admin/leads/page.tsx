'use client';

import { Suspense, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AlarmClock, ClipboardList, Plus } from 'lucide-react';
import { LEAD_SOURCES, LEAD_STATUSES, type LeadSource, type LeadStatus, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { LEAD_TONE } from '@/components/admin/tones';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { AdminPage, issuesToMap, Pagination, SearchInput, useAdminMutation } from '@/components/admin/kit';
import { useBranches, useUrlState } from '@/components/admin/hooks';
import { cn } from '@/lib/utils';

interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  status: LeadStatus;
  interest: string | null;
  createdAt: string;
  branch: { name: LocalizedText } | null;
  assignedTo: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  nextTask: { body: string; dueAt: string | null } | null;
  overdue: boolean;
}
const DEFAULTS = { q: '', status: '', source: '', assignedToId: '', page: '1' };

function LeadsList() {
  const t = useTranslations('admin.leads');
  const enums = useTranslations('enums');
  const fmt = useFmt();
  const can = useCan();
  const [f, set] = useUrlState(DEFAULTS);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-leads', f],
    queryFn: () =>
      api.get<{ items: LeadRow[]; total: number; page: number; pageSize: number; pipeline: Record<string, number> }>(
        `/admin/leads${qs({ ...f, pageSize: 25 })}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <AdminPage
      title={t('title')}
      description={t('lead')}
      actions={
        can('leads.create') && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> {t('add')}
          </Button>
        )
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => set({ status: f.status === s ? '' : s })}
            className={cn(
              'rounded-xl border bg-surface p-4 text-left transition-colors',
              f.status === s ? 'border-foreground' : 'border-border hover:border-border-strong',
            )}
            aria-pressed={f.status === s}
          >
            <p className="text-xs font-medium text-muted">{enums(`leadStatus.${s}`)}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{data?.pipeline[s] ?? 0}</p>
          </button>
        ))}
      </div>
      <Card>
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[2fr_1fr_1fr]">
          <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder={t('search')} />
          <Select aria-label={t('source')} value={f.source} onChange={(e) => set({ source: e.target.value })}>
            <option value="">{t('anySource')}</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {enums(`leadSource.${s}`)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('assignee')}
            value={f.assignedToId}
            onChange={(e) => set({ assignedToId: e.target.value })}
          >
            <option value="">{t('anyone')}</option>
            <option value="me">{t('mine')}</option>
            <option value="none">{t('unassigned')}</option>
          </Select>
        </div>
        {isLoading ? (
          <Skeleton className="m-4 h-64" />
        ) : !data?.items.length ? (
          <EmptyState icon={<ClipboardList />} title={t('empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('name')}</Th>
                <Th>{t('status')}</Th>
                <Th>{t('source')}</Th>
                <Th>{t('assignee')}</Th>
                <Th>{t('nextStep')}</Th>
                <Th>{t('created')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l.id} className="hover:bg-surface-2/50">
                  <Td>
                    <Link href={`/admin/leads/${l.id}`} className="font-semibold hover:text-primary">
                      {l.name}
                    </Link>
                    <span className="block text-xs text-muted">{l.phone ?? l.email}</span>
                  </Td>
                  <Td>
                    <Badge tone={LEAD_TONE[l.status]}>{enums(`leadStatus.${l.status}`)}</Badge>
                  </Td>
                  <Td>
                    {enums(`leadSource.${l.source}`)}
                    {l.interest && <span className="block text-xs text-muted">{l.interest}</span>}
                  </Td>
                  <Td>
                    {l.assignedTo ? (
                      l.assignedTo.profile ? (
                        `${l.assignedTo.profile.firstName} ${l.assignedTo.profile.lastName}`
                      ) : (
                        l.assignedTo.email
                      )
                    ) : (
                      <span className="text-muted">{t('unassigned')}</span>
                    )}
                  </Td>
                  <Td>
                    {l.nextTask ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-sm',
                          l.overdue && 'font-medium text-danger',
                        )}
                      >
                        <AlarmClock className="size-3.5" /> {l.nextTask.dueAt ? fmt.dateTime(l.nextTask.dueAt) : ''}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{fmt.relative(l.createdAt)}</Td>
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
      {creating && <CreateLeadDialog onClose={() => setCreating(false)} />}
    </AdminPage>
  );
}

function CreateLeadDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('admin.leads');
  const enums = useTranslations('enums.leadSource');
  const fmt = useFmt();
  const branches = useBranches();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    source: 'WALK_IN' as LeadSource,
    branchId: '',
    interest: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useAdminMutation(() => api.post('/admin/leads', { ...form, branchId: form.branchId || null }), {
    invalidate: [['admin-leads']],
    success: t('created'),
    onSuccess: onClose,
    onError: (e) => {
      const map = issuesToMap(e);
      setErrors(map);
      return Object.keys(map).length > 0;
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader title={t('add')} />
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('name')} error={errors.name} className="sm:col-span-2">
            {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          </Field>
          <Field label={t('phone')} error={errors.phone}>
            {(p) => (
              <Input
                {...p}
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            )}
          </Field>
          <Field label="E-mail" error={errors.email}>
            {(p) => (
              <Input
                {...p}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('source')}>
            {(p) => (
              <Select
                {...p}
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as LeadSource })}
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {enums(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('branch')}>
            {(p) => (
              <Select {...p} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">—</option>
                {(branches.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {fmt.t(b.name)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('interest')} className="sm:col-span-2">
            {(p) => (
              <Input {...p} value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} />
            )}
          </Field>
          <Field label={t('message')} className="sm:col-span-2">
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            )}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => create.mutate(undefined)} loading={create.isPending}>
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Page() {
  return (
    <Suspense>
      <LeadsList />
    </Suspense>
  );
}
