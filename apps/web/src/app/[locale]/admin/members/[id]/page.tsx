'use client';

import { use, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Ban,
  CalendarPlus,
  CircleCheck,
  KeyRound,
  Pencil,
  QrCode,
  RefreshCcw,
  Snowflake,
  StickyNote,
  Ticket,
  XCircle,
} from 'lucide-react';
import {
  addDaysToKey,
  localDateKey,
  PAYMENT_METHODS,
  remainingVisits,
  type LocalizedText,
  type MembershipStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Avatar, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Badge, Card, CardHeader, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { MembershipStatusBadge, PaymentStatusBadge } from '@/components/account/membership-ui';
import { AdminPage, ConfirmDialog, issuesToMap, useAdminMutation } from '@/components/admin/kit';
import { useBranches, usePlans, useTrainers } from '@/components/admin/hooks';
import { InvoiceDialog } from '@/components/invoice-dialog';

interface Membership {
  id: string;
  status: MembershipStatus;
  startsAt: string;
  endsAt: string;
  price: number;
  visitLimit: number | null;
  visitsUsed: number;
  freezeMaxDays: number;
  frozenDaysUsed: number;
  planSnapshot: { name: LocalizedText; code: string };
  freezes: { id: string; startDate: string; endDate: string; days: number; status: string }[];
  events: { id: string; type: string; createdAt: string; data: Record<string, unknown> | null }[];
}
interface MemberDetail {
  id: string;
  memberNumber: number;
  homeBranch: { id: string; name: LocalizedText };
  assignedTrainer: { id: string; displayName: string } | null;
  isDemo: boolean;
  user: {
    id: string;
    email: string;
    status: string;
    locale: string;
    emailVerifiedAt: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    profile: {
      firstName: string;
      lastName: string;
      phone: string | null;
      avatarUrl: string | null;
      marketingOptIn: boolean;
    };
  };
  memberships: Membership[];
  notes?: {
    id: string;
    body: string;
    createdAt: string;
    author: { email: string; profile: { firstName: string; lastName: string } | null };
  }[];
  assignments: {
    id: string;
    status: string;
    startDate: string;
    program: { id: string; name: string };
    trainer: { displayName: string };
  }[];
  bookings: {
    id: string;
    status: string;
    session: {
      id: string;
      startsAt: string;
      status: string;
      classType: { name: LocalizedText };
      trainer: { displayName: string };
    };
  }[];
  checkIns: {
    id: string;
    createdAt: string;
    status: string;
    method: string;
    rejectReason: string | null;
    overrideReason: string | null;
    branch: { name: LocalizedText };
  }[];
  payments:
    | {
        id: string;
        amount: number;
        status: PaymentStatus;
        method: PaymentMethod;
        purpose: string;
        isTest: boolean;
        paidAt: string | null;
        createdAt: string;
        invoice: { id: string; number: string } | null;
      }[]
    | null;
}

type DialogKind = 'sell' | 'renew' | 'freeze' | 'extend' | 'cancel' | 'edit' | 'note' | 'suspend' | 'qr' | null;

export default function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('admin.memberDetail');
  const enums = useTranslations('enums');
  const reasons = useTranslations('reasons');
  const fmt = useFmt();
  const can = useCan();
  const leadId = useSearchParams().get('lead');
  const [dialog, setDialog] = useState<DialogKind>(leadId ? 'sell' : null);
  const [target, setTarget] = useState<Membership | null>(null);
  const [invoice, setInvoice] = useState<string | null>(null);
  const {
    data: m,
    isLoading,
    isError,
  } = useQuery({ queryKey: ['admin-member', id], queryFn: () => api.get<MemberDetail>(`/admin/members/${id}`) });
  const key = [['admin-member', id], ['admin-members']];

  const unfreeze = useAdminMutation((msId: string) => api.post(`/admin/memberships/${msId}/unfreeze`), {
    invalidate: key,
    success: t('unfrozen'),
  });
  const cancelFreeze = useAdminMutation(
    (freezeId: string) => api.post(`/admin/memberships/freezes/${freezeId}/cancel`),
    { invalidate: key },
  );
  const revokeQr = useAdminMutation(() => api.post(`/admin/checkins/revoke-qr/${id}`), { success: t('qrRevoked') });

  if (isLoading) return <Skeleton className="h-[480px]" />;
  if (isError || !m)
    return (
      <EmptyState
        title={t('notFound')}
        action={
          <Button asChild variant="outline">
            <Link href="/admin/members">{t('back')}</Link>
          </Button>
        }
      />
    );

  const name = `${m.user.profile.firstName} ${m.user.profile.lastName}`;
  const current =
    m.memberships.find((x) => x.status === 'ACTIVE') ??
    m.memberships.find((x) => x.status === 'FROZEN') ??
    m.memberships.find((x) => x.status === 'PENDING');
  const open = (kind: DialogKind, ms?: Membership) => {
    setTarget(ms ?? current ?? null);
    setDialog(kind);
  };

  return (
    <AdminPage
      title={
        <span className="flex items-center gap-3">
          <Avatar src={m.user.profile.avatarUrl} name={name} className="size-10" />
          {name}
          {m.user.status === 'SUSPENDED' && <Badge tone="danger">{t('suspended')}</Badge>}
          {m.isDemo && <Badge tone="warning">{t('demo')}</Badge>}
        </span>
      }
      description={`FC-${String(m.memberNumber).padStart(6, '0')} · ${m.user.email} · ${m.user.profile.phone ?? '—'}`}
      actions={
        <>
          {can('memberships.sell') && (
            <Button onClick={() => open('sell')}>
              <Ticket /> {t('sell')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{t('more')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {can('members.write') && (
                <DropdownMenuItem onSelect={() => setDialog('edit')}>
                  <Pencil /> {t('edit')}
                </DropdownMenuItem>
              )}
              {can('members.notes') && (
                <DropdownMenuItem onSelect={() => setDialog('note')}>
                  <StickyNote /> {t('addNote')}
                </DropdownMenuItem>
              )}
              {can('members.write') && (
                <DropdownMenuItem onSelect={() => revokeQr.mutate(undefined)}>
                  <QrCode /> {t('revokeQr')}
                </DropdownMenuItem>
              )}
              {can('members.write') && can('memberships.manage') && (
                <DropdownMenuItem onSelect={() => setDialog('suspend')}>
                  {m.user.status === 'SUSPENDED' ? <CircleCheck /> : <Ban />}{' '}
                  {m.user.status === 'SUSPENDED' ? t('reactivate') : t('suspend')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href="/admin/checkin">
                  <KeyRound /> {t('toReception')}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title={t('memberships')} />
            {!m.memberships.length ? (
              <EmptyState icon={<Ticket />} title={t('noMemberships')} />
            ) : (
              <ul className="divide-y divide-border">
                {m.memberships.map((ms) => {
                  const visits = remainingVisits(ms);
                  const open_ = ms.status === 'ACTIVE' || ms.status === 'FROZEN';
                  return (
                    <li key={ms.id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-2 font-semibold">
                            {fmt.t(ms.planSnapshot.name)} <MembershipStatusBadge status={ms.status} />
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {fmt.date(ms.startsAt)} — {fmt.lastDay(ms.endsAt)} · {fmt.money(ms.price)}
                            {visits !== null && ` · ${t('visitsLeft', { count: visits })}`} ·{' '}
                            {t('freezeUsed', { used: ms.frozenDaysUsed, total: ms.freezeMaxDays })}
                          </p>
                        </div>
                        {open_ && can('memberships.manage') && (
                          <div className="flex flex-wrap gap-2">
                            {can('payments.record') && (
                              <Button size="sm" variant="outline" onClick={() => open('renew', ms)}>
                                <RefreshCcw /> {t('renew')}
                              </Button>
                            )}
                            {ms.status === 'ACTIVE' && ms.freezeMaxDays > 0 && (
                              <Button size="sm" variant="outline" onClick={() => open('freeze', ms)}>
                                <Snowflake /> {t('freeze')}
                              </Button>
                            )}
                            {ms.status === 'FROZEN' && (
                              <Button
                                size="sm"
                                variant="outline"
                                loading={unfreeze.isPending}
                                onClick={() => unfreeze.mutate(ms.id)}
                              >
                                {t('unfreeze')}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => open('extend', ms)}>
                              <CalendarPlus /> {t('extend')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger"
                              onClick={() => open('cancel', ms)}
                            >
                              <XCircle /> {t('cancelMembership')}
                            </Button>
                          </div>
                        )}
                      </div>
                      {ms.freezes
                        .filter((f) => f.status === 'SCHEDULED')
                        .map((f) => (
                          <div
                            key={f.id}
                            className="mt-3 flex items-center justify-between rounded-md bg-info-soft px-3 py-2 text-sm text-info"
                          >
                            {t('scheduledFreeze', { from: fmt.date(f.startDate), days: f.days })}
                            {can('memberships.manage') && (
                              <Button size="sm" variant="ghost" onClick={() => cancelFreeze.mutate(f.id)}>
                                {t('cancelFreeze')}
                              </Button>
                            )}
                          </div>
                        ))}
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-muted">
                          {t('history', { count: ms.events.length })}
                        </summary>
                        <ol className="mt-2 space-y-1 border-l border-border pl-4">
                          {ms.events.map((e) => (
                            <li key={e.id} className="flex justify-between gap-4">
                              <span>
                                {enums(`membershipEvent.${e.type}`)}
                                {e.data?.reason ? <span className="text-muted"> — {String(e.data.reason)}</span> : null}
                                {e.data?.days ? <span className="text-muted"> ({String(e.data.days)}d)</span> : null}
                              </span>
                              <span className="shrink-0 text-muted">{fmt.dateTime(e.createdAt)}</span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Tabs defaultValue="bookings">
            <TabsList>
              <TabsTrigger value="bookings">{t('tabs.bookings')}</TabsTrigger>
              <TabsTrigger value="visits">{t('tabs.visits')}</TabsTrigger>
              {m.payments && <TabsTrigger value="payments">{t('tabs.payments')}</TabsTrigger>}
              <TabsTrigger value="training">{t('tabs.training')}</TabsTrigger>
            </TabsList>
            <TabsContent value="bookings">
              <Card>
                {!m.bookings.length ? (
                  <EmptyState title={t('noBookings')} />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>{t('when')}</Th>
                        <Th>{t('class')}</Th>
                        <Th>{t('status')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.bookings.map((b) => (
                        <tr key={b.id}>
                          <Td className="whitespace-nowrap">
                            <Link href={`/admin/schedule/${b.session.id}`} className="hover:text-primary">
                              {fmt.dateTime(b.session.startsAt)}
                            </Link>
                          </Td>
                          <Td>
                            {fmt.t(b.session.classType.name)}{' '}
                            <span className="text-muted">· {b.session.trainer.displayName}</span>
                          </Td>
                          <Td>
                            <Badge>{enums(`bookingStatus.${b.status}`)}</Badge>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </TabsContent>
            <TabsContent value="visits">
              <Card>
                {!m.checkIns.length ? (
                  <EmptyState title={t('noVisits')} />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>{t('when')}</Th>
                        <Th>{t('branch')}</Th>
                        <Th>{t('method')}</Th>
                        <Th>{t('result')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.checkIns.map((c) => (
                        <tr key={c.id}>
                          <Td className="whitespace-nowrap">{fmt.dateTime(c.createdAt)}</Td>
                          <Td>{fmt.t(c.branch.name)}</Td>
                          <Td>{enums(`checkinMethod.${c.method}`)}</Td>
                          <Td>
                            {c.status === 'ACCEPTED' ? (
                              <Badge tone="success">{enums('checkinStatus.ACCEPTED')}</Badge>
                            ) : (
                              <Badge tone="danger">
                                {c.rejectReason ? reasons(c.rejectReason) : enums('checkinStatus.REJECTED')}
                              </Badge>
                            )}
                            {c.overrideReason && <span className="ml-2 text-xs text-muted">{c.overrideReason}</span>}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </TabsContent>
            {m.payments && (
              <TabsContent value="payments">
                <Card>
                  {!m.payments.length ? (
                    <EmptyState title={t('noPayments')} />
                  ) : (
                    <Table>
                      <thead>
                        <tr>
                          <Th>{t('when')}</Th>
                          <Th>{t('purpose')}</Th>
                          <Th>{t('method')}</Th>
                          <Th>{t('status')}</Th>
                          <Th className="text-right">{t('amount')}</Th>
                          <Th />
                        </tr>
                      </thead>
                      <tbody>
                        {m.payments.map((p) => (
                          <tr key={p.id}>
                            <Td className="whitespace-nowrap">{fmt.date(p.paidAt ?? p.createdAt)}</Td>
                            <Td>{enums(`paymentPurpose.${p.purpose}`)}</Td>
                            <Td>{enums(`paymentMethod.${p.method}`)}</Td>
                            <Td>
                              <span className="flex gap-1.5">
                                <PaymentStatusBadge status={p.status} />
                                {p.isTest && <Badge tone="warning">{t('test')}</Badge>}
                              </span>
                            </Td>
                            <Td className="text-right tabular-nums">{fmt.money(p.amount)}</Td>
                            <Td className="text-right">
                              {p.invoice && (
                                <Button size="sm" variant="ghost" onClick={() => setInvoice(p.invoice!.id)}>
                                  {p.invoice.number}
                                </Button>
                              )}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card>
              </TabsContent>
            )}
            <TabsContent value="training">
              <Card>
                {!m.assignments.length ? (
                  <EmptyState
                    title={t('noPrograms')}
                    action={
                      can('training.manage_own') || can('training.manage_all') ? (
                        <Button asChild variant="outline">
                          <Link href="/admin/training">{t('assignProgram')}</Link>
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {m.assignments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                        <span>
                          <span className="font-semibold">{a.program.name}</span>{' '}
                          <span className="text-muted">· {a.trainer.displayName}</span>
                        </span>
                        <Badge>{a.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card className="p-5 text-sm">
            <dl className="space-y-3">
              {[
                [t('homeBranch'), fmt.t(m.homeBranch.name)],
                [t('trainer'), m.assignedTrainer?.displayName ?? '—'],
                [t('joined'), fmt.date(m.user.createdAt)],
                [t('lastLogin'), m.user.lastLoginAt ? fmt.relative(m.user.lastLoginAt) : '—'],
                [t('emailVerified'), m.user.emailVerifiedAt ? t('yes') : t('no')],
                [t('language'), m.user.locale.toUpperCase()],
                [t('marketing'), m.user.profile.marketingOptIn ? t('yes') : t('no')],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {m.notes && (
            <Card>
              <CardHeader
                title={t('notes')}
                action={
                  <Button size="sm" variant="ghost" onClick={() => setDialog('note')}>
                    {t('addNote')}
                  </Button>
                }
              />
              {!m.notes.length ? (
                <p className="p-5 text-sm text-muted">{t('noNotes')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {m.notes.map((n) => (
                    <li key={n.id} className="px-5 py-3 text-sm">
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <p className="mt-1 text-xs text-muted">
                        {n.author.profile
                          ? `${n.author.profile.firstName} ${n.author.profile.lastName}`
                          : n.author.email}{' '}
                        · {fmt.relative(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>

      {dialog === 'sell' && <SellDialog memberId={m.id} leadId={leadId} onClose={() => setDialog(null)} />}
      {dialog === 'renew' && target && (
        <RenewDialog membership={target} memberId={m.id} onClose={() => setDialog(null)} />
      )}
      {dialog === 'freeze' && target && (
        <FreezeDialog membership={target} memberId={m.id} onClose={() => setDialog(null)} />
      )}
      {dialog === 'extend' && target && (
        <ExtendDialog membership={target} memberId={m.id} onClose={() => setDialog(null)} />
      )}
      {dialog === 'cancel' && target && (
        <CancelMembership membership={target} memberId={m.id} onClose={() => setDialog(null)} />
      )}
      {dialog === 'edit' && <EditMemberDialog member={m} onClose={() => setDialog(null)} />}
      {dialog === 'note' && <NoteDialog memberId={m.id} onClose={() => setDialog(null)} />}
      {dialog === 'suspend' && <SuspendDialog member={m} onClose={() => setDialog(null)} />}
      {invoice && (
        <InvoiceDialog invoiceId={invoice} path="/admin/payments/invoices" onClose={() => setInvoice(null)} />
      )}
    </AdminPage>
  );
}

function SellDialog({ memberId, leadId, onClose }: { memberId: string; leadId: string | null; onClose: () => void }) {
  const t = useTranslations('admin.memberDetail');
  const enums = useTranslations('enums.paymentMethod');
  const fmt = useFmt();
  const can = useCan();
  const plans = usePlans();
  const active = (plans.data ?? []).filter((p) => p.status === 'ACTIVE');
  const [planId, setPlanId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CARD_TERMINAL');
  const [reference, setReference] = useState('');
  const [promoCode, setPromo] = useState('');
  const [startDate, setStart] = useState(localDateKey(new Date()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const plan = active.find((p) => p.id === planId);
  const sell = useAdminMutation(
    () =>
      api.post<{ status: string; redirectUrl: string | null }>('/admin/memberships/sell', {
        memberId,
        planId,
        paymentMethod: method,
        paymentReference: reference || undefined,
        promoCode: promoCode || undefined,
        startDate,
        leadId: leadId ?? undefined,
      }),
    {
      invalidate: [['admin-member', memberId], ['admin-members']],
      success: t('sold'),
      onSuccess: (r) => {
        if (r.redirectUrl) window.open(r.redirectUrl, '_blank', 'noopener');
        onClose();
      },
      onError: (e) => {
        const map = issuesToMap(e);
        setErrors(map);
        return Object.keys(map).length > 0;
      },
    },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader title={t('sellTitle')} description={t('sellLead')} />
        <DialogBody className="space-y-4">
          <Field label={t('plan')} error={errors.planId}>
            {(p) => (
              <Select {...p} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">—</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fmt.t(p.name)} · {fmt.money(p.price)} · {p.durationDays}d{!p.isPublic ? ` · ${t('internal')}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {plan?.requiresStudentId && (
            <p className="rounded-md bg-info-soft p-3 text-sm text-info">{t('studentCheck')}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('startDate')} error={errors.startDate}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={startDate}
                  min={localDateKey(new Date())}
                  max={addDaysToKey(localDateKey(new Date()), 30)}
                  onChange={(e) => setStart(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('promo')} error={errors.promoCode}>
              {(p) => <Input {...p} value={promoCode} onChange={(e) => setPromo(e.target.value.toUpperCase())} />}
            </Field>
            <Field label={t('method')}>
              {(p) => (
                <Select {...p} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m} disabled={m !== 'ONLINE' && !can('payments.record')}>
                      {enums(m)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('reference')} hint={t('referenceHint')}>
              {(p) => <Input {...p} value={reference} onChange={(e) => setReference(e.target.value)} />}
            </Field>
          </div>
          <p className="text-xs text-muted">{method === 'ONLINE' ? t('onlineNote') : t('offlineNote')}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => sell.mutate(undefined)} loading={sell.isPending} disabled={!planId}>
            {plan ? t('sellConfirm', { amount: fmt.money(plan.price) }) : t('sell')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenewDialog({
  membership,
  memberId,
  onClose,
}: {
  membership: Membership;
  memberId: string;
  onClose: () => void;
}) {
  const t = useTranslations('admin.memberDetail');
  const enums = useTranslations('enums.paymentMethod');
  const fmt = useFmt();
  const [method, setMethod] = useState<PaymentMethod>('CARD_TERMINAL');
  const [reference, setReference] = useState('');
  const renew = useAdminMutation(
    () =>
      api.post(`/admin/memberships/${membership.id}/renew`, {
        paymentMethod: method,
        paymentReference: reference || undefined,
      }),
    {
      invalidate: [['admin-member', memberId]],
      success: t('renewed'),
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader
          title={t('renewTitle')}
          description={t('renewLead', { plan: fmt.t(membership.planSnapshot.name) })}
        />
        <DialogBody className="space-y-4">
          <Field label={t('method')}>
            {(p) => (
              <Select {...p} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.filter((m) => m !== 'ONLINE').map((m) => (
                  <option key={m} value={m}>
                    {enums(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('reference')}>
            {(p) => <Input {...p} value={reference} onChange={(e) => setReference(e.target.value)} />}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => renew.mutate(undefined)} loading={renew.isPending}>
            {t('renewConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreezeDialog({
  membership,
  memberId,
  onClose,
}: {
  membership: Membership;
  memberId: string;
  onClose: () => void;
}) {
  const t = useTranslations('admin.memberDetail');
  const today = localDateKey(new Date());
  const [startDate, setStart] = useState(today);
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');
  const freeze = useAdminMutation(
    () => api.post(`/admin/memberships/${membership.id}/freeze`, { startDate, days, reason: reason || undefined }),
    {
      invalidate: [['admin-member', memberId]],
      success: t('frozen'),
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader
          title={t('freezeTitle')}
          description={t('freezeLead', { left: membership.freezeMaxDays - membership.frozenDaysUsed })}
        />
        <DialogBody className="space-y-4">
          <Field label={t('startDate')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={startDate}
                min={today}
                max={addDaysToKey(today, 30)}
                onChange={(e) => setStart(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('days')}>
            {(p) => (
              <Input {...p} type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            )}
          </Field>
          <Field label={t('reasonOptional')}>
            {(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => freeze.mutate(undefined)} loading={freeze.isPending}>
            {t('freeze')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtendDialog({
  membership,
  memberId,
  onClose,
}: {
  membership: Membership;
  memberId: string;
  onClose: () => void;
}) {
  const t = useTranslations('admin.memberDetail');
  const [days, setDays] = useState(3);
  const extend = useAdminMutation(
    (reason: string) => api.post(`/admin/memberships/${membership.id}/extend`, { days, reason }),
    { invalidate: [['admin-member', memberId]], success: t('extended'), onSuccess: onClose },
  );
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('extendTitle')}
      description={t('extendLead')}
      confirmLabel={t('extend')}
      requireReason
      loading={extend.isPending}
      onConfirm={(r) => extend.mutate(r)}
    >
      <Field label={t('days')}>
        {(p) => (
          <Input
            {...p}
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        )}
      </Field>
    </ConfirmDialog>
  );
}

function CancelMembership({
  membership,
  memberId,
  onClose,
}: {
  membership: Membership;
  memberId: string;
  onClose: () => void;
}) {
  const t = useTranslations('admin.memberDetail');
  const cancel = useAdminMutation(
    (reason: string) => api.post(`/admin/memberships/${membership.id}/cancel`, { reason }),
    { invalidate: [['admin-member', memberId], ['admin-members']], success: t('cancelled'), onSuccess: onClose },
  );
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('cancelTitle')}
      description={t('cancelLead')}
      confirmLabel={t('cancelMembership')}
      danger
      requireReason
      loading={cancel.isPending}
      onConfirm={(r) => cancel.mutate(r)}
    />
  );
}

function SuspendDialog({ member, onClose }: { member: MemberDetail; onClose: () => void }) {
  const t = useTranslations('admin.memberDetail');
  const suspended = member.user.status === 'SUSPENDED';
  const run = useAdminMutation(
    (reason: string) =>
      api.post(`/admin/members/${member.id}/status`, { status: suspended ? 'ACTIVE' : 'SUSPENDED', reason }),
    {
      invalidate: [['admin-member', member.id], ['admin-members']],
      success: suspended ? t('reactivated') : t('suspendedToast'),
      onSuccess: onClose,
    },
  );
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={suspended ? t('reactivate') : t('suspendTitle')}
      description={suspended ? undefined : t('suspendLead')}
      confirmLabel={suspended ? t('reactivate') : t('suspend')}
      danger={!suspended}
      requireReason
      loading={run.isPending}
      onConfirm={(r) => run.mutate(r)}
    />
  );
}

function NoteDialog({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const t = useTranslations('admin.memberDetail');
  const [body, setBody] = useState('');
  const add = useAdminMutation(() => api.post(`/admin/members/${memberId}/notes`, { body }), {
    invalidate: [['admin-member', memberId]],
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader title={t('addNote')} description={t('noteLead')} />
        <DialogBody>
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} aria-label={t('addNote')} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => add.mutate(undefined)} loading={add.isPending} disabled={!body.trim()}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ member, onClose }: { member: MemberDetail; onClose: () => void }) {
  const t = useTranslations('admin.memberDetail');
  const fmt = useFmt();
  const branches = useBranches();
  const trainers = useTrainers();
  const [form, setForm] = useState({
    firstName: member.user.profile.firstName,
    lastName: member.user.profile.lastName,
    phone: member.user.profile.phone ?? '',
    homeBranchId: member.homeBranch.id,
    assignedTrainerId: member.assignedTrainer?.id ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminMutation(
    () => api.patch(`/admin/members/${member.id}`, { ...form, assignedTrainerId: form.assignedTrainerId || null }),
    {
      invalidate: [['admin-member', member.id], ['admin-members']],
      success: t('saved'),
      onSuccess: onClose,
      onError: (e) => {
        const map = issuesToMap(e);
        setErrors(map);
        return Object.keys(map).length > 0;
      },
    },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader title={t('edit')} />
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
          <Field label={t('phone')} error={errors.phone}>
            {(p) => <Input {...p} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
          </Field>
          <Field label={t('homeBranch')}>
            {(p) => (
              <Select
                {...p}
                value={form.homeBranchId}
                onChange={(e) => setForm({ ...form, homeBranchId: e.target.value })}
              >
                {(branches.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {fmt.t(b.name)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('trainer')} className="sm:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={form.assignedTrainerId}
                onChange={(e) => setForm({ ...form, assignedTrainerId: e.target.value })}
              >
                <option value="">—</option>
                {(trainers.data ?? [])
                  .filter((tr) => tr.isActive)
                  .map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.displayName}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
