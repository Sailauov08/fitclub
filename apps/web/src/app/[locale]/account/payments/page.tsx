'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FileText, Receipt } from 'lucide-react';
import type { LocalizedText, PaymentMethod, PaymentStatus } from '@fitclub/shared';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { PageTitle } from '@/components/account/shell';
import { PaymentStatusBadge } from '@/components/account/membership-ui';
import { InvoiceDialog } from '@/components/invoice-dialog';

interface PaymentRow {
  id: string;
  purpose: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  discount: number;
  isTest: boolean;
  paidAt: string | null;
  createdAt: string;
  invoice: { id: string; number: string } | null;
  refunds: { amount: number }[];
  metadata: { planName?: LocalizedText } | null;
}

export default function MyPaymentsPage() {
  const t = useTranslations('account.payments');
  const enums = useTranslations('enums');
  const fmt = useFmt();
  const { data, isLoading } = useQuery({
    queryKey: ['my-payments'],
    queryFn: () => api.get<PaymentRow[]>('/me/payments'),
  });
  const [invoice, setInvoice] = useState<string | null>(null);

  return (
    <>
      <PageTitle title={t('title')} description={t('lead')} />
      <Card>
        {isLoading ? (
          <Skeleton className="m-5 h-40" />
        ) : !data?.length ? (
          <EmptyState icon={<Receipt />} title={t('none')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('date')}</Th>
                <Th>{t('item')}</Th>
                <Th>{t('method')}</Th>
                <Th>{t('status')}</Th>
                <Th className="text-right">{t('amount')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">{fmt.date(p.paidAt ?? p.createdAt)}</Td>
                  <Td>
                    <span className="font-medium">
                      {p.metadata?.planName ? fmt.t(p.metadata.planName) : enums(`paymentPurpose.${p.purpose}`)}
                    </span>
                    <span className="block text-xs text-muted">{enums(`paymentPurpose.${p.purpose}`)}</span>
                  </Td>
                  <Td>{enums(`paymentMethod.${p.method}`)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <PaymentStatusBadge status={p.status} />
                      {p.isTest && <Badge tone="warning">{t('test')}</Badge>}
                    </div>
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">{fmt.money(p.amount)}</Td>
                  <Td className="text-right">
                    {p.invoice && (
                      <Button size="sm" variant="ghost" onClick={() => setInvoice(p.invoice!.id)}>
                        <FileText /> {p.invoice.number}
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted">{t('note')}</p>
      {invoice && <InvoiceDialog invoiceId={invoice} path="/me/invoices" onClose={() => setInvoice(null)} />}
    </>
  );
}
