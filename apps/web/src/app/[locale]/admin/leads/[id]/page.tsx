'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CalendarClock, CheckCircle2, Mail, MessageSquare, Phone, Ticket, UserRoundCheck } from 'lucide-react';
import {
  LEAD_STATUSES,
  type LeadActivityType,
  type LeadSource,
  type LeadStatus,
  type LocalizedText,
} from '@fitclub/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { AdminPage, issuesToMap, useAdminMutation } from '@/components/admin/kit';
import { useBranches } from '@/components/admin/hooks';
import { LEAD_TONE } from '@/components/admin/tones';

interface LeadDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  status: LeadStatus;
  interest: string | null;
  message: string | null;
  preferredDate: string | null;
  lostReason: string | null;
  createdAt: string;
  consentAt: string | null;
  branch: { id: string; name: LocalizedText } | null;
  assignedTo: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  convertedMember: { id: string; memberNumber: number } | null;
  activities: {
    id: string;
    type: LeadActivityType;
    body: string;
    dueAt: string | null;
    completedAt: string | null;
    createdAt: string;
    actor: { email: string; profile: { firstName: string; lastName: string } | null } | null;
  }[];
}

const ICONS: Partial<Record<LeadActivityType, typeof Phone>> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: UserRoundCheck,
  TASK: CalendarClock,
  NOTE: MessageSquare,
};

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('admin.leadDetail');
  const enums = useTranslations('enums');
  const fmt = useFmt();
  const can = useCan();
  const router = useRouter();
  const { data: lead, isLoading } = useQuery({
    queryKey: ['admin-lead', id],
    queryFn: () => api.get<LeadDetail>(`/admin/leads/${id}`),
  });
  const assignees = useQuery({
    queryKey: ['lead-assignees'],
    queryFn: () =>
      api.get<
        {
          userId: string;
          role: string;
          user: { email: string; profile: { firstName: string; lastName: string } | null };
        }[]
      >('/admin/leads/assignees'),
  });
  const [activity, setActivity] = useState<{ type: LeadActivityType; body: string; dueAt: string }>({
    type: 'CALL',
    body: '',
    dueAt: '',
  });
  const [lostReason, setLostReason] = useState('');
  const [converting, setConverting] = useState(false);
  const keys = [['admin-lead', id], ['admin-leads']];
  const status = useAdminMutation(
    (next: LeadStatus) =>
      api.put(`/admin/leads/${id}/status`, { status: next, lostReason: next === 'LOST' ? lostReason : undefined }),
    { invalidate: keys, success: t('updated') },
  );
  const assign = useAdminMutation(
    (assignedToId: string | null) => api.put(`/admin/leads/${id}/assignee`, { assignedToId }),
    { invalidate: keys, success: t('updated') },
  );
  const addActivity = useAdminMutation(
    () =>
      api.post(`/admin/leads/${id}/activities`, {
        type: activity.type,
        body: activity.body,
        dueAt: activity.dueAt ? new Date(activity.dueAt).toISOString() : undefined,
      }),
    { invalidate: keys, onSuccess: () => setActivity({ type: activity.type, body: '', dueAt: '' }) },
  );
  const complete = useAdminMutation(
    (activityId: string) => api.post(`/admin/leads/${id}/activities/${activityId}/complete`),
    { invalidate: keys },
  );

  if (isLoading || !lead) return <Skeleton className="h-96" />;
  return (
    <AdminPage
      title={lead.name}
      description={`${enums(`leadSource.${lead.source}`)} · ${fmt.dateTime(lead.createdAt)}`}
      actions={
        lead.convertedMember ? (
          <Button asChild variant="outline">
            <Link href={`/admin/members/${lead.convertedMember.id}`}>
              <CheckCircle2 /> {t('openMember')}
            </Link>
          </Button>
        ) : (
          can('members.write') &&
          can('leads.manage') && (
            <Button onClick={() => setConverting(true)}>
              <Ticket /> {t('convert')}
            </Button>
          )
        )
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {can('leads.manage') && (
            <Card className="p-5">
              <p className="mb-3 text-sm font-semibold">{t('pipeline')}</p>
              <div className="flex flex-wrap gap-2">
                {LEAD_STATUSES.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={lead.status === s ? 'secondary' : 'outline'}
                    disabled={
                      status.isPending || (s === 'LOST' && lostReason.trim().length < 3 && lead.status !== 'LOST')
                    }
                    onClick={() => status.mutate(s)}
                  >
                    {enums(`leadStatus.${s}`)}
                  </Button>
                ))}
              </div>
              {lead.status !== 'LOST' && (
                <Input
                  className="mt-3 max-w-md"
                  placeholder={t('lostReasonPlaceholder')}
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  aria-label={t('lostReason')}
                />
              )}
              {lead.lostReason && (
                <p className="mt-3 text-sm text-muted">{t('lostBecause', { reason: lead.lostReason })}</p>
              )}
            </Card>
          )}
          {can('leads.manage') && (
            <Card className="p-5">
              <p className="mb-3 text-sm font-semibold">{t('logActivity')}</p>
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <Select
                  aria-label={t('type')}
                  value={activity.type}
                  onChange={(e) => setActivity({ ...activity, type: e.target.value as LeadActivityType })}
                >
                  {(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK'] as const).map((type) => (
                    <option key={type} value={type}>
                      {enums(`leadActivity.${type}`)}
                    </option>
                  ))}
                </Select>
                <Textarea
                  rows={2}
                  value={activity.body}
                  onChange={(e) => setActivity({ ...activity, body: e.target.value })}
                  aria-label={t('details')}
                  placeholder={t('detailsPlaceholder')}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
                {activity.type === 'TASK' && (
                  <Input
                    type="datetime-local"
                    value={activity.dueAt}
                    onChange={(e) => setActivity({ ...activity, dueAt: e.target.value })}
                    className="w-60"
                    aria-label={t('due')}
                  />
                )}
                <Button
                  onClick={() => addActivity.mutate(undefined)}
                  loading={addActivity.isPending}
                  disabled={!activity.body.trim() || (activity.type === 'TASK' && !activity.dueAt)}
                >
                  {t('add')}
                </Button>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title={t('timeline')} />
            {!lead.activities.length ? (
              <EmptyState title={t('noActivity')} />
            ) : (
              <ol className="divide-y divide-border">
                {lead.activities.map((a) => {
                  const Icon = ICONS[a.type] ?? MessageSquare;
                  const overdue = a.type === 'TASK' && !a.completedAt && a.dueAt && new Date(a.dueAt) < new Date();
                  return (
                    <li key={a.id} className="flex gap-4 px-5 py-4">
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="flex flex-wrap items-center gap-2">
                          <Badge>{enums(`leadActivity.${a.type}`)}</Badge>
                          {a.type === 'TASK' && a.dueAt && (
                            <span className={overdue ? 'font-medium text-danger' : 'text-muted'}>
                              {t('dueAt', { date: fmt.dateTime(a.dueAt) })}
                            </span>
                          )}
                          {a.completedAt && <Badge tone="success">{t('done')}</Badge>}
                        </p>
                        <p className="mt-1.5 whitespace-pre-wrap">{a.body}</p>
                        <p className="mt-1 text-xs text-muted">
                          {a.actor
                            ? a.actor.profile
                              ? `${a.actor.profile.firstName} ${a.actor.profile.lastName}`
                              : a.actor.email
                            : t('website')}{' '}
                          · {fmt.relative(a.createdAt)}
                        </p>
                      </div>
                      {a.type === 'TASK' && !a.completedAt && can('leads.manage') && (
                        <Button size="sm" variant="outline" onClick={() => complete.mutate(a.id)}>
                          {t('markDone')}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5 text-sm">
            <Badge tone={LEAD_TONE[lead.status]}>{enums(`leadStatus.${lead.status}`)}</Badge>
            <dl className="mt-4 space-y-3">
              {[
                [t('phone'), lead.phone ?? '—'],
                ['E-mail', lead.email ?? '—'],
                [t('branch'), lead.branch ? fmt.t(lead.branch.name) : '—'],
                [t('interest'), lead.interest ?? '—'],
                [t('preferredDate'), lead.preferredDate ? fmt.date(lead.preferredDate) : '—'],
                [t('consent'), lead.consentAt ? fmt.date(lead.consentAt) : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {lead.message && <p className="mt-4 rounded-md bg-surface-2 p-3">{lead.message}</p>}
            <div className="mt-4 flex gap-2">
              {lead.phone && (
                <Button asChild size="sm" variant="outline">
                  <a href={`tel:${lead.phone}`}>
                    <Phone /> {t('call')}
                  </a>
                </Button>
              )}
              {lead.email && (
                <Button asChild size="sm" variant="outline">
                  <a href={`mailto:${lead.email}`}>
                    <Mail /> E-mail
                  </a>
                </Button>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <Field label={t('assignee')}>
              {(p) => (
                <Select
                  {...p}
                  value={lead.assignedTo?.id ?? ''}
                  disabled={!can('leads.assign') || assign.isPending}
                  onChange={(e) => assign.mutate(e.target.value || null)}
                >
                  <option value="">{t('unassigned')}</option>
                  {(assignees.data ?? []).map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.user.profile ? `${a.user.profile.firstName} ${a.user.profile.lastName}` : a.user.email} ·{' '}
                      {enums(`role.${a.role}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Card>
        </div>
      </div>
      {converting && (
        <ConvertDialog
          lead={lead}
          onClose={() => setConverting(false)}
          onDone={(memberId) => router.push(`/admin/members/${memberId}?lead=${lead.id}`)}
        />
      )}
    </AdminPage>
  );
}

function ConvertDialog({
  lead,
  onClose,
  onDone,
}: {
  lead: LeadDetail;
  onClose: () => void;
  onDone: (memberId: string) => void;
}) {
  const t = useTranslations('admin.leadDetail');
  const fmt = useFmt();
  const branches = useBranches();
  const [first, ...rest] = lead.name.split(' ');
  const [form, setForm] = useState({
    email: lead.email ?? '',
    firstName: first ?? '',
    lastName: rest.join(' '),
    phone: lead.phone ?? '',
    homeBranchId: lead.branch?.id ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const convert = useAdminMutation(() => api.post<{ memberId: string }>(`/admin/leads/${lead.id}/convert`, form), {
    invalidate: [['admin-lead', lead.id], ['admin-leads']],
    success: t('converted'),
    onSuccess: (r) => onDone(r.memberId),
    onError: (e) => {
      const map = issuesToMap(e);
      setErrors(map);
      return Object.keys(map).length > 0;
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader title={t('convertTitle')} description={t('convertLead')} />
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('firstName')} error={errors.firstName}>
            {(p) => (
              <Input {...p} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            )}
          </Field>
          <Field label={t('lastName')} error={errors.lastName}>
            {(p) => (
              <Input {...p} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
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
          <Field label={t('phone')} error={errors.phone}>
            {(p) => <Input {...p} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
          </Field>
          <Field label={t('branch')} error={errors.homeBranchId} className="sm:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={form.homeBranchId}
                onChange={(e) => setForm({ ...form, homeBranchId: e.target.value })}
              >
                <option value="">—</option>
                {(branches.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {fmt.t(b.name)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <p className="text-xs text-muted sm:col-span-2">{t('convertNote')}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => convert.mutate(undefined)} loading={convert.isPending}>
            {t('convert')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
