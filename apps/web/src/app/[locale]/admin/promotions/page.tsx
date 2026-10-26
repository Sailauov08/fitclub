'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Pencil, Plus, Tag } from 'lucide-react';
import { PROMOTION_STATUSES, type LocalizedText, type PromotionStatus, type PromotionType } from '@fitclub/shared';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Checkbox, Switch } from '@/components/ui/controls';
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { AdminPage, emptyText, issuesToMap, LocalizedField, useAdminMutation } from '@/components/admin/kit';
import { usePlans } from '@/components/admin/hooks';

interface Promo {
  id: string;
  code: string | null;
  name: LocalizedText;
  description: LocalizedText;
  type: PromotionType;
  value: number;
  status: PromotionStatus;
  validFrom: string | null;
  validUntil: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  perMemberLimit: number | null;
  newMembersOnly: boolean;
  planIds: string[];
  minAmount: number | null;
  isPublic: boolean;
  imageUrl: string | null;
  performance: { redemptions: number; discountGiven: number; revenue: number };
}

export default function PromotionsAdmin() {
  const t = useTranslations('admin.promotions');
  const fmt = useFmt();
  const [editing, setEditing] = useState<Promo | 'new' | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-promotions'],
    queryFn: () => api.get<Promo[]>('/admin/promotions'),
  });
  return (
    <AdminPage
      title={t('title')}
      description={t('lead')}
      actions={
        <Button onClick={() => setEditing('new')}>
          <Plus /> {t('add')}
        </Button>
      }
    >
      <Card>
        {isLoading ? (
          <Skeleton className="m-4 h-56" />
        ) : !data?.length ? (
          <EmptyState icon={<Tag />} title={t('empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('promotion')}</Th>
                <Th>{t('discount')}</Th>
                <Th>{t('validity')}</Th>
                <Th>{t('usage')}</Th>
                <Th>{t('performance')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <p className="flex items-center gap-2 font-semibold">
                      {fmt.t(p.name)}
                      <Badge tone={p.status === 'ACTIVE' ? 'success' : p.status === 'PAUSED' ? 'warning' : 'neutral'}>
                        {t(`status.${p.status}`)}
                      </Badge>
                      {p.isPublic && <Badge tone="info">{t('public')}</Badge>}
                    </p>
                    {p.code && <code className="text-xs text-muted">{p.code}</code>}
                  </Td>
                  <Td className="font-semibold">{p.type === 'PERCENT' ? `${p.value}%` : fmt.money(p.value)}</Td>
                  <Td className="whitespace-nowrap text-sm text-muted">
                    {p.validFrom ? fmt.date(p.validFrom) : '—'} → {p.validUntil ? fmt.lastDay(p.validUntil) : '∞'}
                  </Td>
                  <Td className="text-sm">
                    {p.redemptionCount}
                    {p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}
                    {p.newMembersOnly && <span className="block text-xs text-muted">{t('newOnly')}</span>}
                  </Td>
                  <Td className="text-sm">
                    {t('revenue', { amount: fmt.money(p.performance.revenue) })}
                    <span className="block text-xs text-muted">
                      {t('given', { amount: fmt.money(p.performance.discountGiven) })}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={t('edit')}>
                      <Pencil />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <PromoDialog promo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </AdminPage>
  );
}

function PromoDialog({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
  const t = useTranslations('admin.promotions');
  const fmt = useFmt();
  const plans = usePlans();
  const day = (v: string | null, end = false) =>
    v ? new Date(new Date(v).getTime() - (end ? 1 : 0) + 5 * 3_600_000).toISOString().slice(0, 10) : '';
  const [form, setForm] = useState({
    code: promo?.code ?? '',
    name: promo?.name ?? emptyText(),
    description: promo?.description ?? emptyText(),
    type: promo?.type ?? ('PERCENT' as PromotionType),
    value: promo?.value ?? 10,
    status: promo?.status ?? ('ACTIVE' as PromotionStatus),
    validFrom: day(promo?.validFrom ?? null),
    validUntil: day(promo?.validUntil ?? null, true),
    maxRedemptions: (promo?.maxRedemptions ?? null) as number | null,
    perMemberLimit: (promo ? promo.perMemberLimit : 1) as number | null,
    newMembersOnly: promo?.newMembersOnly ?? false,
    planIds: promo?.planIds ?? [],
    minAmount: (promo?.minAmount ?? null) as number | null,
    isPublic: promo?.isPublic ?? false,
    imageUrl: promo?.imageUrl ?? null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const body = {
    ...form,
    code: form.code || null,
    validFrom: form.validFrom || null,
    validUntil: form.validUntil || null,
    imageUrl: form.imageUrl || null,
  };
  const save = useAdminMutation(
    () => (promo ? api.put(`/admin/promotions/${promo.id}`, body) : api.post('/admin/promotions', body)),
    {
      invalidate: [['admin-promotions']],
      revalidateSite: true,
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
      <DialogContent size="xl">
        <DialogHeader title={promo ? t('edit') : t('add')} />
        <DialogBody className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <LocalizedField
              label={t('name')}
              value={form.name}
              onChange={(name) => setForm({ ...form, name })}
              error={errors.name}
              required
            />
            <LocalizedField
              label={t('description')}
              value={form.description}
              onChange={(description) => setForm({ ...form, description })}
              multiline
              rows={2}
            />
            <Field label={t('code')} hint={t('codeHint')} error={errors.code}>
              {(p) => (
                <Input
                  {...p}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
              )}
            </Field>
            <Field label={t('image')} hint={t('imageHint')} error={errors.imageUrl}>
              {(p) => (
                <Input
                  {...p}
                  value={form.imageUrl ?? ''}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                />
              )}
            </Field>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Field label={t('type')}>
                {(p) => (
                  <Select
                    {...p}
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as PromotionType })}
                  >
                    <option value="PERCENT">%</option>
                    <option value="FIXED">₸</option>
                  </Select>
                )}
              </Field>
              <Field label={t('value')} error={errors.value}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label={t('statusLabel')}>
                {(p) => (
                  <Select
                    {...p}
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as PromotionStatus })}
                  >
                    {PROMOTION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('from')} error={errors.validFrom}>
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t('until')} error={errors.validUntil}>
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t('minAmount')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    value={form.minAmount ?? ''}
                    onChange={(e) => setForm({ ...form, minAmount: e.target.value ? Number(e.target.value) : null })}
                  />
                )}
              </Field>
              <Field label={t('maxRedemptions')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    value={form.maxRedemptions ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, maxRedemptions: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                )}
              </Field>
              <Field label={t('perMember')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    value={form.perMemberLimit ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, perMemberLimit: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                )}
              </Field>
            </div>
            <label className="flex items-center justify-between text-sm">
              {t('newMembersOnly')}{' '}
              <Switch checked={form.newMembersOnly} onCheckedChange={(v) => setForm({ ...form, newMembersOnly: v })} />
            </label>
            <label className="flex items-center justify-between text-sm">
              {t('isPublic')}{' '}
              <Switch checked={form.isPublic} onCheckedChange={(v) => setForm({ ...form, isPublic: v })} />
            </label>
            <div>
              <p className="text-[0.8rem] font-medium">{t('plans')}</p>
              <p className="text-xs text-muted">{t('plansHint')}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(plans.data ?? [])
                  .filter((p) => p.status === 'ACTIVE')
                  .map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.planIds.includes(p.id)}
                        onCheckedChange={(v) =>
                          setForm({
                            ...form,
                            planIds: v ? [...form.planIds, p.id] : form.planIds.filter((x) => x !== p.id),
                          })
                        }
                      />
                      {fmt.t(p.name)}
                    </label>
                  ))}
              </div>
            </div>
          </div>
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
