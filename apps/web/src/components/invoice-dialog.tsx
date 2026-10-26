'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Printer } from 'lucide-react';
import type { LocalizedText } from '@fitclub/shared';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge, Skeleton } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Logo } from '@/components/site/brand';

interface Invoice {
  id: string;
  number: string;
  issuedAt: string;
  items: { description: LocalizedText | null; purpose: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discount: number;
  total: number;
  payment: {
    method: string;
    status: string;
    isTest: boolean;
    refunds: { amount: number; createdAt: string; reason: string }[];
  };
  member: {
    memberNumber: number;
    user: { email: string; profile: { firstName: string; lastName: string; phone: string | null } | null };
  };
}

/** Printable invoice/receipt. Uses the browser's print dialog ("Save as PDF"). */
export function InvoiceDialog({
  invoiceId,
  path,
  onClose,
}: {
  invoiceId: string;
  path: '/me/invoices' | '/admin/payments/invoices';
  onClose: () => void;
}) {
  const t = useTranslations('invoice');
  const enums = useTranslations('enums');
  const fmt = useFmt();
  const { data, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => api.get<Invoice>(`${path}/${invoiceId}`),
  });
  const refunded = data?.payment.refunds.reduce((s, r) => s + r.amount, 0) ?? 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader title={data ? t('title', { number: data.number }) : t('loading')} />
        <DialogBody>
          {isLoading || !data ? (
            <Skeleton className="h-64" />
          ) : (
            <div id="invoice-print" className="space-y-6 text-sm">
              <div className="flex items-start justify-between">
                <Logo />
                <div className="text-right">
                  <p className="font-semibold">{data.number}</p>
                  <p className="text-muted">{fmt.dateLong(data.issuedAt)}</p>
                  {data.payment.isTest && (
                    <Badge tone="warning" className="mt-1">
                      {t('test')}
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">{t('billedTo')}</p>
                <p className="mt-1 font-medium">
                  {data.member.user.profile?.firstName} {data.member.user.profile?.lastName}
                </p>
                <p className="text-muted">
                  FC-{String(data.member.memberNumber).padStart(6, '0')} · {data.member.user.email}
                </p>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                    <th className="py-2">{t('description')}</th>
                    <th className="py-2 text-right">{t('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="py-3">
                        {item.description ? fmt.t(item.description) : enums(`paymentPurpose.${item.purpose}`)}
                        <span className="block text-xs text-muted">{enums(`paymentPurpose.${item.purpose}`)}</span>
                      </td>
                      <td className="py-3 text-right tabular-nums">{fmt.money(item.unitPrice * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="ml-auto w-full max-w-xs space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-muted">{t('subtotal')}</dt>
                  <dd className="tabular-nums">{fmt.money(data.subtotal)}</dd>
                </div>
                {data.discount > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">{t('discount')}</dt>
                    <dd className="tabular-nums">−{fmt.money(data.discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <dt>{t('total')}</dt>
                  <dd className="tabular-nums">{fmt.money(data.total)}</dd>
                </div>
                {refunded > 0 && (
                  <div className="flex justify-between text-info">
                    <dt>{t('refunded')}</dt>
                    <dd className="tabular-nums">−{fmt.money(refunded)}</dd>
                  </div>
                )}
              </dl>
              <p className="text-xs text-muted">
                {t('paidBy', { method: enums(`paymentMethod.${data.payment.method}`) })} ·{' '}
                {enums(`paymentStatus.${data.payment.status}`)}
              </p>
              <p className="text-xs text-muted">{t('legalNote')}</p>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="no-print">
          <Button variant="outline" onClick={() => window.print()} disabled={!data}>
            <Printer /> {t('print')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
