'use client';

import { Suspense, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Download, UserPlus, Users } from 'lucide-react';
import { z } from 'zod';
import { createMemberSchema, remainingVisits, type LocalizedText, type MembershipStatus } from '@fitclub/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { api, qs } from '@/lib/api';
import { useCan, useMe } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Avatar, Checkbox } from '@/components/ui/controls';
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field, useFormErrorHandler } from '@/components/ui/form';
import { MembershipStatusBadge } from '@/components/account/membership-ui';
import { AdminPage, Pagination, SearchInput } from '@/components/admin/kit';
import { useBranches, usePlans, useTrainers, useUrlState } from '@/components/admin/hooks';

interface MemberRow {
  id: string;
  memberNumber: number;
  createdAt: string;
  isDemo: boolean;
  homeBranch: { id: string; name: LocalizedText };
  assignedTrainer: { id: string; displayName: string } | null;
  user: {
    id: string;
    email: string;
    status: string;
    profile: { firstName: string; lastName: string; phone: string | null; avatarUrl: string | null } | null;
  };
  currentMembership: {
    status: MembershipStatus;
    endsAt: string;
    visitLimit: number | null;
    visitsUsed: number;
    planSnapshot: { name: LocalizedText };
  } | null;
}

const DEFAULTS = {
  q: '',
  status: '',
  branchId: '',
  planId: '',
  trainerId: '',
  expiringWithinDays: '',
  sort: 'newest',
  page: '1',
};

function MembersList() {
  const t = useTranslations('admin.members');
  const fmt = useFmt();
  const can = useCan();
  const [f, set] = useUrlState(DEFAULTS);
  const branches = useBranches();
  const plans = usePlans();
  const trainers = useTrainers();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-members', f],
    queryFn: () => api.get<Paginated<MemberRow>>(`/admin/members${qs({ ...f, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <AdminPage
      title={t('title')}
      description={data ? t('count', { count: data.total }) : undefined}
      actions={
        <>
          {can('members.export') && (
            <Button asChild variant="outline">
              <a href={`/api/admin/members/export.csv${qs(f)}`} download>
                <Download /> {t('export')}
              </a>
            </Button>
          )}
          {can('members.write') && (
            <Button onClick={() => setCreating(true)}>
              <UserPlus /> {t('add')}
            </Button>
          )}
        </>
      }
    >
      <Card>
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[2fr_repeat(4,1fr)]">
          <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder={t('search')} />
          <Select aria-label={t('status')} value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">{t('anyStatus')}</option>
            {(['ACTIVE', 'FROZEN', 'PENDING', 'EXPIRED', 'NONE'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`statusFilter.${s}`)}
              </option>
            ))}
          </Select>
          <Select aria-label={t('plan')} value={f.planId} onChange={(e) => set({ planId: e.target.value })}>
            <option value="">{t('anyPlan')}</option>
            {(plans.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {fmt.t(p.name)}
              </option>
            ))}
          </Select>
          <Select aria-label={t('branch')} value={f.branchId} onChange={(e) => set({ branchId: e.target.value })}>
            <option value="">{t('anyBranch')}</option>
            {(branches.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {fmt.t(b.name)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('more')}
            value={f.expiringWithinDays || f.trainerId ? `${f.expiringWithinDays}|${f.trainerId}` : ''}
            onChange={(e) => {
              const [exp, tr] = e.target.value.split('|');
              set({ expiringWithinDays: exp ?? '', trainerId: tr ?? '' });
            }}
          >
            <option value="">{t('moreFilters')}</option>
            <option value="7|">{t('expiring7')}</option>
            <option value="30|">{t('expiring30')}</option>
            {(trainers.data ?? []).map((tr) => (
              <option key={tr.id} value={`|${tr.id}`}>
                {t('trainerFilter', { name: tr.displayName })}
              </option>
            ))}
          </Select>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState icon={<Users />} title={t('empty')} description={t('emptyBody')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('member')}</Th>
                <Th>{t('contact')}</Th>
                <Th>{t('membership')}</Th>
                <Th>{t('branch')}</Th>
                <Th>{t('trainer')}</Th>
                <Th>{t('joined')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => {
                const name = `${m.user.profile?.firstName ?? ''} ${m.user.profile?.lastName ?? ''}`.trim();
                const visits = m.currentMembership ? remainingVisits(m.currentMembership) : null;
                return (
                  <tr key={m.id} className="hover:bg-surface-2/50">
                    <Td>
                      <Link href={`/admin/members/${m.id}`} className="flex items-center gap-3">
                        <Avatar src={m.user.profile?.avatarUrl} name={name} className="size-8" />
                        <span>
                          <span className="block font-semibold hover:text-primary">{name}</span>
                          <span className="text-xs text-muted">FC-{String(m.memberNumber).padStart(6, '0')}</span>
                        </span>
                        {m.user.status === 'SUSPENDED' && <Badge tone="danger">{t('suspended')}</Badge>}
                      </Link>
                    </Td>
                    <Td>
                      <span className="block">{m.user.email}</span>
                      <span className="text-xs text-muted">{m.user.profile?.phone}</span>
                    </Td>
                    <Td>
                      {m.currentMembership ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{fmt.t(m.currentMembership.planSnapshot.name)}</span>
                            <MembershipStatusBadge status={m.currentMembership.status} />
                          </div>
                          <span className="text-xs text-muted">
                            {t('until', { date: fmt.lastDay(m.currentMembership.endsAt) })}
                            {visits !== null && ` · ${t('visitsLeft', { count: visits })}`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted">{t('noMembership')}</span>
                      )}
                    </Td>
                    <Td>{fmt.t(m.homeBranch.name)}</Td>
                    <Td>{m.assignedTrainer?.displayName ?? <span className="text-muted">—</span>}</Td>
                    <Td className="whitespace-nowrap text-muted">{fmt.date(m.createdAt)}</Td>
                  </tr>
                );
              })}
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
      {creating && <CreateMemberDialog onClose={() => setCreating(false)} />}
    </AdminPage>
  );
}

function CreateMemberDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('admin.members');
  const fmt = useFmt();
  const router = useRouter();
  const { data: me } = useMe();
  const branches = useBranches();
  const form = useForm<z.input<typeof createMemberSchema>, unknown, z.output<typeof createMemberSchema>>({
    resolver: zodResolver(createMemberSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      locale: 'ru',
      homeBranchId: me?.staff?.branch?.id ?? '',
      sendInvite: true,
    },
  });
  const sendInvite = useWatch({ control: form.control, name: 'sendInvite' });
  const onError = useFormErrorHandler(form.setError);
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    try {
      const member = await api.post<{ id: string }>('/admin/members', values);
      router.push(`/admin/members/${member.id}`);
    } catch (err) {
      onError(err);
    }
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader title={t('addTitle')} description={t('addLead')} />
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t('firstName')} error={e.firstName} required>
              {(p) => <Input {...p} {...form.register('firstName')} />}
            </Field>
            <Field label={t('lastName')} error={e.lastName} required>
              {(p) => <Input {...p} {...form.register('lastName')} />}
            </Field>
            <Field label="E-mail" error={e.email} required>
              {(p) => <Input {...p} type="email" {...form.register('email')} />}
            </Field>
            <Field label={t('phone')} error={e.phone} required>
              {(p) => <Input {...p} type="tel" {...form.register('phone')} placeholder="+7 7__ ___ __ __" />}
            </Field>
            <Field label={t('homeBranch')} error={e.homeBranchId} required>
              {(p) => (
                <Select {...p} {...form.register('homeBranchId')}>
                  <option value="">—</option>
                  {(branches.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {fmt.t(b.name)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('language')}>
              {(p) => (
                <Select {...p} {...form.register('locale')}>
                  <option value="ru">Русский</option>
                  <option value="kk">Қазақша</option>
                  <option value="en">English</option>
                </Select>
              )}
            </Field>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <Checkbox checked={sendInvite} onCheckedChange={(v) => form.setValue('sendInvite', v === true)} />
              {t('sendInvite')}
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Page() {
  return (
    <Suspense>
      <MembersList />
    </Suspense>
  );
}
