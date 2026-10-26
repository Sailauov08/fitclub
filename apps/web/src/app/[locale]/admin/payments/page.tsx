'use client';

import { Suspense, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CreditCard, FileText, Undo2 } from 'lucide-react';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  RECONCILIATION_STATUSES,
  type LocalizedText,
  type PaymentMethod,
  type PaymentStatus,
  type ReconciliationStatus,
} from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/controls';
import { Badge, Card, EmptyState, Skeleton, Stat, Table, Td, Th } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { PaymentStatusBadge } from '@/components/account/membership-ui';
import { InvoiceDialog } from '@/components/invoice-dialog';
import { AdminPage, Pagination, SearchInput, useAdminMutation } from '@/components/admin/kit';
import { useUrlState } from '@/components/admin/hooks';

interface PaymentRow {
  id: string;
  amount: number;
  discount: number;
  status: PaymentStatus;
  method: PaymentMethod;
  purpose: string;
  provider: string;
  isTest: boolean;
  reconciliationStatus: ReconciliationStatus;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
  member: {
    id: string;
    memberNumber: number;
    user: { email: string; profile: { firstName: string; lastName: string } | null };
  };
  invoice: { number: string } | null;
  refunds: { amount: number }[];
}
interface PaymentDetail extends PaymentRow {
  subtotal: number;
  failureReason: string | null;
  reconciliationNote: string | null;
  invoice: ({ id: string; number: string } & Record<string, unknown>) | null;
  refunds: { id: string; amount: number; reason: string; createdAt: string }[];
  events: {
    id: string;
    type: string;
    eventId: string;
    processedAt: string | null;
    error: string | null;
    createdAt: string;
  }[];
  promotion: { code: string | null; name: LocalizedText } | null;
}

const DEFAULTS = { q: '', status: '', method: '', reconciliation: '', from: '', to: '', includeTest: '', page: '1' };

function PaymentsList() {
  const t = useTranslations('admin.payments');
  const enums = useTranslations('enums');
  const fmt = useFmt();
  const [f, set] = useUrlState(DEFAULTS);
  const [selected, setSelected] = useState<string | null>(null);
  const provider = useQuery({
    queryKey: ['provider-status'],
    queryFn: () =>
      api.get<{ online: 'SANDBOX' | 'NONE'; liveProviderConfigured: boolean }>('/payments/provider-status'),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['admin-payments', f],
    queryFn: () =>
      api.get<{
        items: PaymentRow[];
        total: number;
        page: number;
        pageSize: number;
        summary: { capturedAmount: number; capturedCount: number };
      }>(`/admin/payments${qs({ ...f, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <AdminPage title={t('title')} description={t('lead')}>
      {data && (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Stat
            label={t('captured')}
            value={fmt.money(data.summary.capturedAmount)}
            hint={t('capturedHint', { count: data.summary.capturedCount })}
          />
          <Stat label={t('records')} value={fmt.number(data.total)} />
          <Stat
            label={t('providerMode')}
            value={provider.data?.online === 'SANDBOX' ? t('sandboxOnly') : t('noOnline')}
            hint={provider.data?.liveProviderConfigured ? undefined : t('sandboxHint')}
          />
        </div>
      )}
      <Card>
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[2fr_repeat(3,1fr)_auto_auto]">
          <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder={t('search')} />
          <Select aria-label={t('status')} value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">{t('anyStatus')}</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {enums(`paymentStatus.${s}`)}
              </option>
            ))}
          </Select>
          <Select aria-label={t('method')} value={f.method} onChange={(e) => set({ method: e.target.value })}>
            <option value="">{t('anyMethod')}</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {enums(`paymentMethod.${m}`)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('reconciliation')}
            value={f.reconciliation}
            onChange={(e) => set({ reconciliation: e.target.value })}
          >
            <option value="">{t('anyReconciliation')}</option>
            {RECONCILIATION_STATUSES.map((r) => (
              <option key={r} value={r}>
                {enums(`reconciliation.${r}`)}
              </option>
            ))}
          </Select>
          <Input type="date" aria-label={t('from')} value={f.from} onChange={(e) => set({ from: e.target.value })} />
          <Input type="date" aria-label={t('to')} value={f.to} onChange={(e) => set({ to: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-muted md:col-span-6">
            <Checkbox
              checked={f.includeTest !== 'false'}
              onCheckedChange={(v) => set({ includeTest: v ? '' : 'false' })}
            />{' '}
            {t('includeTest')}
          </label>
        </div>
        {isLoading ? (
          <Skeleton className="m-4 h-64" />
        ) : !data?.items.length ? (
          <EmptyState icon={<CreditCard />} title={t('empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('date')}</Th>
                <Th>{t('member')}</Th>
                <Th>{t('purpose')}</Th>
                <Th>{t('method')}</Th>
                <Th>{t('status')}</Th>
                <Th>{t('reconciliation')}</Th>
                <Th className="text-right">{t('amount')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setSelected(p.id)}>
                  <Td className="whitespace-nowrap">{fmt.date(p.paidAt ?? p.createdAt)}</Td>
                  <Td>
                    <Link
                      href={`/admin/members/${p.member.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium hover:text-primary"
                    >
                      {p.member.user.profile?.firstName} {p.member.user.profile?.lastName}
                    </Link>
                    <span className="block text-xs text-muted">
                      {p.invoice?.number ?? p.reference ?? p.member.user.email}
                    </span>
                  </Td>
                  <Td>{enums(`paymentPurpose.${p.purpose}`)}</Td>
                  <Td>{enums(`paymentMethod.${p.method}`)}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      <PaymentStatusBadge status={p.status} />
                      {p.isTest && <Badge tone="warning">{t('test')}</Badge>}
                    </span>
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        p.reconciliationStatus === 'MATCHED'
                          ? 'success'
                          : p.reconciliationStatus === 'DISCREPANCY'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {enums(`reconciliation.${p.reconciliationStatus}`)}
                    </Badge>
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">{fmt.money(p.amount)}</Td>
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
      {selected && <PaymentDrawer id={selected} onClose={() => setSelected(null)} />}
    </AdminPage>
  );
}

function PaymentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('admin.payments');
  const enums = useTranslations('enums');
  const fmt = useFmt();
  const can = useCan();
  const { data } = useQuery({
    queryKey: ['admin-payment', id],
    queryFn: () => api.get<PaymentDetail>(`/admin/payments/${id}`),
  });
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [cancelMembership, setCancelMembership] = useState(false);
  const [recon, setRecon] = useState<ReconciliationStatus | ''>('');
  const [note, setNote] = useState('');
  const [invoice, setInvoice] = useState(false);
  const keys = [['admin-payment', id], ['admin-payments']];
  const refund = useAdminMutation(
    () =>
      api.post(`/admin/payments/${id}/refunds`, {
        amount: Number(refundAmount),
        reason: refundReason,
        cancelMembership,
      }),
    {
      invalidate: keys,
      success: t('refunded'),
      onSuccess: () => {
        setRefundAmount('');
        setRefundReason('');
      },
    },
  );
  const reconcile = useAdminMutation(
    () => api.put(`/admin/payments/${id}/reconciliation`, { status: recon, note: note || undefined }),
    { invalidate: keys, success: t('reconciled') },
  );
  const refunded = data?.refunds.reduce((s, r) => s + r.amount, 0) ?? 0;
  const refundable =
    data && (data.status === 'SUCCEEDED' || data.status === 'PARTIALLY_REFUNDED') ? data.amount - refunded : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title={data ? `${fmt.money(data.amount)} · ${enums(`paymentMethod.${data.method}`)}` : t('loading')}
          description={
            data
              ? `${data.member.user.profile?.firstName ?? ''} ${data.member.user.profile?.lastName ?? ''} · ${fmt.dateTime(data.createdAt)}`
              : undefined
          }
        />
        <DialogBody className="space-y-6">
          {!data ? (
            <Skeleton className="h-48" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <PaymentStatusBadge status={data.status} />
                {data.isTest && <Badge tone="warning">{t('testLong')}</Badge>}
                <Badge>{data.provider}</Badge>
                {data.promotion && <Badge tone="info">{data.promotion.code}</Badge>}
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted">{t('subtotal')}</dt>
                <dd>{fmt.money(data.subtotal)}</dd>
                <dt className="text-muted">{t('discount')}</dt>
                <dd>{fmt.money(data.discount)}</dd>
                <dt className="text-muted">{t('refundedTotal')}</dt>
                <dd>{fmt.money(refunded)}</dd>
                <dt className="text-muted">{t('paidAt')}</dt>
                <dd>{data.paidAt ? fmt.dateTime(data.paidAt) : '—'}</dd>
                {data.failureReason && (
                  <>
                    <dt className="text-muted">{t('failure')}</dt>
                    <dd className="text-danger">{data.failureReason}</dd>
                  </>
                )}
              </dl>
              {data.invoice && (
                <Button variant="outline" size="sm" onClick={() => setInvoice(true)}>
                  <FileText /> {data.invoice.number}
                </Button>
              )}
              {data.events.length > 0 && (
                <div>
                  <p className="text-sm font-semibold">{t('providerEvents')}</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {data.events.map((e) => (
                      <li key={e.id} className="flex justify-between gap-3 font-mono">
                        <span>
                          {e.type} · {e.eventId}
                        </span>
                        <span className={e.error ? 'text-danger' : 'text-muted'}>
                          {e.error ?? (e.processedAt ? t('processed') : t('pending'))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.refunds.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {data.refunds.map((r) => (
                    <li key={r.id} className="flex justify-between gap-3">
                      <span>
                        −{fmt.money(r.amount)} · {r.reason}
                      </span>
                      <span className="text-muted">{fmt.date(r.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {can('payments.refund') && refundable > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Undo2 className="size-4" /> {t('refund')}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
                    <Field label={t('amount')} hint={t('max', { amount: fmt.money(refundable) })}>
                      {(p) => (
                        <Input
                          {...p}
                          type="number"
                          min={1}
                          max={refundable}
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                        />
                      )}
                    </Field>
                    <Field label={t('reason')}>
                      {(p) => (
                        <Textarea
                          {...p}
                          rows={2}
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <Checkbox checked={cancelMembership} onCheckedChange={(v) => setCancelMembership(v === true)} />{' '}
                    {t('cancelMembership')}
                  </label>
                  <p className="mt-2 text-xs text-muted">{t('refundNote')}</p>
                  <Button
                    className="mt-3"
                    variant="danger"
                    size="sm"
                    loading={refund.isPending}
                    disabled={!Number(refundAmount) || refundReason.trim().length < 3}
                    onClick={() => refund.mutate(undefined)}
                  >
                    {t('issueRefund')}
                  </Button>
                </div>
              )}
              {can('payments.reconcile') && (
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm font-semibold">{t('reconciliation')}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto]">
                    <Select
                      aria-label={t('reconciliation')}
                      value={recon || data.reconciliationStatus}
                      onChange={(e) => setRecon(e.target.value as ReconciliationStatus)}
                    >
                      {RECONCILIATION_STATUSES.map((r) => (
                        <option key={r} value={r}>
                          {enums(`reconciliation.${r}`)}
                        </option>
                      ))}
                    </Select>
                    <Input
                      placeholder={t('note')}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      aria-label={t('note')}
                    />
                    <Button
                      size="md"
                      variant="outline"
                      disabled={!recon}
                      loading={reconcile.isPending}
                      onClick={() => reconcile.mutate(undefined)}
                    >
                      {t('save')}
                    </Button>
                  </div>
                  {data.reconciliationNote && <p className="mt-2 text-xs text-muted">{data.reconciliationNote}</p>}
                </div>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
      {invoice && data?.invoice && (
        <InvoiceDialog invoiceId={data.invoice.id} path="/admin/payments/invoices" onClose={() => setInvoice(false)} />
      )}
    </Dialog>
  );
}

export default function Page() {
  return (
    <Suspense>
      <PaymentsList />
    </Suspense>
  );
}
