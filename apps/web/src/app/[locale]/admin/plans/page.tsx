'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, ArchiveRestore, Pencil, Plus, Ticket } from 'lucide-react';
import { PLAN_TYPES, type LocalizedText } from '@fitclub/shared';
import { api } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import type { Plan } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Checkbox, Switch } from '@/components/ui/controls';
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { AdminPage, emptyText, issuesToMap, LocalizedField, useAdminMutation } from '@/components/admin/kit';
import { useBranches, usePlans } from '@/components/admin/hooks';

export default function PlansPage() {
  const t = useTranslations('admin.plans');
  const typesT = useTranslations('plans.types');
  const fmt = useFmt();
  const can = useCan();
  const plans = usePlans();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const status = useAdminMutation(
    ({ id, archive }: { id: string; archive: boolean }) =>
      api.post(`/admin/plans/${id}/${archive ? 'archive' : 'restore'}`),
    { invalidate: [['admin-plans']], revalidateSite: true },
  );

  return (
    <AdminPage
      title={t('title')}
      description={t('lead')}
      actions={
        can('plans.manage') && (
          <Button onClick={() => setEditing('new')}>
            <Plus /> {t('add')}
          </Button>
        )
      }
    >
      <Card>
        {plans.isLoading ? (
          <Skeleton className="m-4 h-64" />
        ) : !plans.data?.length ? (
          <EmptyState icon={<Ticket />} title={t('empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('plan')}</Th>
                <Th>{t('price')}</Th>
                <Th>{t('duration')}</Th>
                <Th>{t('access')}</Th>
                <Th>{t('freeze')}</Th>
                <Th>{t('sales')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {plans.data.map((p) => (
                <tr key={p.id} className={p.status === 'ARCHIVED' ? 'opacity-55' : undefined}>
                  <Td>
                    <p className="flex items-center gap-2 font-semibold">
                      {fmt.t(p.name)}
                      {p.isFeatured && <Badge tone="primary">{t('featured')}</Badge>}
                      {!p.isPublic && <Badge>{t('hidden')}</Badge>}
                      {p.status === 'ARCHIVED' && <Badge>{t('archived')}</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {p.code} · {typesT(p.type)} · v{p.version}
                    </p>
                  </Td>
                  <Td className="font-semibold tabular-nums">{fmt.money(p.price)}</Td>
                  <Td>
                    {t('days', { count: p.durationDays })}
                    <span className="block text-xs text-muted">
                      {p.visitLimit ? t('visits', { count: p.visitLimit }) : t('unlimited')}
                    </span>
                  </Td>
                  <Td className="text-sm">
                    {p.includesClasses ? t('withClasses') : t('gymOnly')}
                    <span className="block text-xs text-muted">
                      {p.allBranches ? t('allBranches') : t('branchCount', { count: p.branchIds.length })}
                    </span>
                  </Td>
                  <Td className="text-sm">
                    {p.freezeMaxDays ? t('freezeRule', { days: p.freezeMaxDays, times: p.freezeMaxTimes }) : '—'}
                  </Td>
                  <Td className="text-sm">
                    {t('active', { count: p.activeCount ?? 0 })}
                    <span className="block text-xs text-muted">{t('total', { count: p.totalSold ?? 0 })}</span>
                  </Td>
                  <Td className="text-right">
                    {can('plans.manage') && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={t('edit')}>
                          <Pencil />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => status.mutate({ id: p.id, archive: p.status === 'ACTIVE' })}
                          aria-label={p.status === 'ACTIVE' ? t('archive') : t('restore')}
                        >
                          {p.status === 'ACTIVE' ? <Archive /> : <ArchiveRestore />}
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted">{t('historyNote')}</p>
      {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </AdminPage>
  );
}

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const t = useTranslations('admin.plans');
  const typesT = useTranslations('plans.types');
  const fmt = useFmt();
  const branches = useBranches();
  const [form, setForm] = useState({
    code: plan?.code ?? '',
    type: plan?.type ?? 'MONTHLY',
    name: plan?.name ?? emptyText(),
    description: plan?.description ?? emptyText(),
    features: (plan?.features ?? []) as LocalizedText[],
    price: plan?.price ?? 0,
    durationDays: plan?.durationDays ?? 30,
    visitLimit: plan?.visitLimit ?? null,
    includesClasses: plan?.includesClasses ?? true,
    allBranches: plan?.allBranches ?? true,
    branchIds: plan?.branchIds ?? [],
    freezeMaxDays: plan?.freezeMaxDays ?? 0,
    freezeMaxTimes: plan?.freezeMaxTimes ?? 0,
    requiresStudentId: plan?.requiresStudentId ?? false,
    isPublic: plan?.isPublic ?? true,
    isFeatured: plan?.isFeatured ?? false,
    sortOrder: plan?.sortOrder ?? 100,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminMutation(
    () => (plan ? api.put(`/admin/plans/${plan.id}`, form) : api.post('/admin/plans', form)),
    {
      invalidate: [['admin-plans']],
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
  const num = (v: string) => (v === '' ? 0 : Number(v));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader
          title={plan ? t('editTitle', { name: fmt.t(plan.name) }) : t('add')}
          description={plan ? t('editLead') : undefined}
        />
        <DialogBody className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('code')} error={errors.code}>
                {(p) => (
                  <Input
                    {...p}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  />
                )}
              </Field>
              <Field label={t('type')}>
                {(p) => (
                  <Select {...p} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {PLAN_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {typesT(x)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
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
            <div className="space-y-2">
              <p className="text-[0.8rem] font-medium">{t('features')}</p>
              {form.features.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1">
                    <LocalizedField
                      label={`#${i + 1}`}
                      value={f}
                      onChange={(v) => setForm({ ...form, features: form.features.map((x, j) => (j === i ? v : x)) })}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-7"
                    onClick={() => setForm({ ...form, features: form.features.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              {form.features.length < 12 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setForm({ ...form, features: [...form.features, emptyText()] })}
                >
                  <Plus /> {t('addFeature')}
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Field label={t('price')} error={errors.price}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: num(e.target.value) })}
                  />
                )}
              </Field>
              <Field label={t('duration')} error={errors.durationDays}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    value={form.durationDays}
                    onChange={(e) => setForm({ ...form, durationDays: num(e.target.value) })}
                  />
                )}
              </Field>
              <Field label={t('visitLimit')} hint={t('emptyUnlimited')} error={errors.visitLimit}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    value={form.visitLimit ?? ''}
                    onChange={(e) => setForm({ ...form, visitLimit: e.target.value ? Number(e.target.value) : null })}
                  />
                )}
              </Field>
              <Field label={t('freezeDays')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    value={form.freezeMaxDays}
                    onChange={(e) => setForm({ ...form, freezeMaxDays: num(e.target.value) })}
                  />
                )}
              </Field>
              <Field label={t('freezeTimes')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    value={form.freezeMaxTimes}
                    onChange={(e) => setForm({ ...form, freezeMaxTimes: num(e.target.value) })}
                  />
                )}
              </Field>
              <Field label={t('sortOrder')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: num(e.target.value) })}
                  />
                )}
              </Field>
            </div>
            {(
              [
                ['includesClasses', t('includesClasses')],
                ['isPublic', t('isPublic')],
                ['isFeatured', t('isFeatured')],
                ['requiresStudentId', t('requiresStudentId')],
                ['allBranches', t('allBranches')],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 text-sm">
                {label}
                <Switch checked={form[key]} onCheckedChange={(v) => setForm({ ...form, [key]: v })} />
              </label>
            ))}
            {!form.allBranches && (
              <Field label={t('branches')} error={errors.branchIds}>
                {() => (
                  <div className="space-y-2">
                    {(branches.data ?? []).map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.branchIds.includes(b.id)}
                          onCheckedChange={(v) =>
                            setForm({
                              ...form,
                              branchIds: v ? [...form.branchIds, b.id] : form.branchIds.filter((x) => x !== b.id),
                            })
                          }
                        />
                        {fmt.t(b.name)}
                      </label>
                    ))}
                  </div>
                )}
              </Field>
            )}
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
