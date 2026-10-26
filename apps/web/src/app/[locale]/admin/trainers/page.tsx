'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CalendarClock, Pencil, Plus, UsersRound } from 'lucide-react';
import { minutesToHHMM, type LocalizedText } from '@fitclub/shared';
import { api, qs } from '@/lib/api';
import { useCan, useMe } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Avatar, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { AdminPage, emptyText, issuesToMap, LocalizedField, useAdminMutation } from '@/components/admin/kit';
import { useBranches } from '@/components/admin/hooks';
import { defaultRange, RangePicker } from '@/components/admin/range';
import { MediaPicker } from '@/components/admin/media-picker';

interface TrainerRow {
  id: string;
  slug: string;
  userId: string | null;
  displayName: string;
  headline: LocalizedText;
  bio: LocalizedText;
  specializations: string[];
  certifications: string[];
  experienceYears: number;
  photoUrl: string | null;
  branchId: string;
  offersPersonalTraining: boolean;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  branch: { name: LocalizedText };
  user: { email: string } | null;
  _count: { assignedMembers: number; schedules: number };
}

export default function TrainersAdmin() {
  const t = useTranslations('admin.trainers');
  const can = useCan();
  return (
    <AdminPage title={t('title')} description={t('lead')}>
      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">{t('team')}</TabsTrigger>
          {(can('analytics.view') || can('trainers.manage')) && (
            <TabsTrigger value="workload">{t('workload')}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="team">
          <Team />
        </TabsContent>
        <TabsContent value="workload">
          <Workload />
        </TabsContent>
      </Tabs>
    </AdminPage>
  );
}

function Team() {
  const t = useTranslations('admin.trainers');
  const fmt = useFmt();
  const can = useCan();
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-trainers'],
    queryFn: () => api.get<TrainerRow[]>('/admin/trainers'),
  });
  const [editing, setEditing] = useState<TrainerRow | 'new' | null>(null);
  const [availability, setAvailability] = useState<TrainerRow | null>(null);
  return (
    <>
      {can('trainers.manage') && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus /> {t('add')}
          </Button>
        </div>
      )}
      <Card>
        {isLoading ? (
          <Skeleton className="m-4 h-56" />
        ) : !data?.length ? (
          <EmptyState icon={<UsersRound />} title={t('empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('trainer')}</Th>
                <Th>{t('branch')}</Th>
                <Th>{t('specializations')}</Th>
                <Th>{t('load')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((tr) => (
                <tr key={tr.id} className={!tr.isActive ? 'opacity-55' : undefined}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar src={tr.photoUrl} name={tr.displayName} />
                      <div>
                        <p className="font-semibold">{tr.displayName}</p>
                        <p className="text-xs text-muted">{tr.user?.email ?? t('noAccount')}</p>
                      </div>
                      {!tr.isPublic && <Badge>{t('hidden')}</Badge>}
                    </div>
                  </Td>
                  <Td>{fmt.t(tr.branch.name)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {tr.specializations.map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-sm">
                    {t('schedules', { count: tr._count.schedules })}
                    <span className="block text-xs text-muted">
                      {t('clients', { count: tr._count.assignedMembers })}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {(can('trainers.manage') || me?.staff?.trainerId === tr.id) && (
                        <Button size="sm" variant="ghost" onClick={() => setAvailability(tr)}>
                          <CalendarClock /> {t('availability')}
                        </Button>
                      )}
                      {can('trainers.manage') && (
                        <Button size="sm" variant="ghost" onClick={() => setEditing(tr)} aria-label={t('edit')}>
                          <Pencil />
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <TrainerDialog trainer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {availability && <AvailabilityDialog trainer={availability} onClose={() => setAvailability(null)} />}
    </>
  );
}

function TrainerDialog({ trainer, onClose }: { trainer: TrainerRow | null; onClose: () => void }) {
  const t = useTranslations('admin.trainers');
  const fmt = useFmt();
  const branches = useBranches();
  const [form, setForm] = useState({
    slug: trainer?.slug ?? '',
    userId: trainer?.userId ?? null,
    displayName: trainer?.displayName ?? '',
    headline: trainer?.headline ?? emptyText(),
    bio: trainer?.bio ?? emptyText(),
    specializations: trainer?.specializations.join(', ') ?? '',
    certifications: trainer?.certifications.join('\n') ?? '',
    experienceYears: trainer?.experienceYears ?? 0,
    photoUrl: trainer?.photoUrl ?? null,
    branchId: trainer?.branchId ?? branches.data?.[0]?.id ?? '',
    offersPersonalTraining: trainer?.offersPersonalTraining ?? true,
    isPublic: trainer?.isPublic ?? true,
    sortOrder: trainer?.sortOrder ?? 100,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const body = () => ({
    ...form,
    specializations: form.specializations
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    certifications: form.certifications
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  });
  const save = useAdminMutation(
    () => (trainer ? api.put(`/admin/trainers/${trainer.id}`, body()) : api.post('/admin/trainers', body())),
    {
      invalidate: [['admin-trainers']],
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
  const active = useAdminMutation(
    (isActive: boolean) => api.post(`/admin/trainers/${trainer!.id}/active`, { isActive }),
    { invalidate: [['admin-trainers']], revalidateSite: true, onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader title={trainer ? trainer.displayName : t('add')} />
        <DialogBody className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <Field label={t('displayName')} error={errors.displayName}>
              {(p) => (
                <Input
                  {...p}
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              )}
            </Field>
            <LocalizedField
              label={t('headline')}
              value={form.headline}
              onChange={(headline) => setForm({ ...form, headline })}
              error={errors.headline}
              required
            />
            <LocalizedField
              label={t('bio')}
              value={form.bio}
              onChange={(bio) => setForm({ ...form, bio })}
              multiline
              rows={4}
            />
            <MediaPicker
              label={t('photo')}
              value={form.photoUrl}
              onChange={(photoUrl) => setForm({ ...form, photoUrl })}
            />
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('slug')} error={errors.slug}>
                {(p) => (
                  <Input
                    {...p}
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                  />
                )}
              </Field>
              <Field label={t('branch')}>
                {(p) => (
                  <Select {...p} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                    {(branches.data ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {fmt.t(b.name)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('experience')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    value={form.experienceYears}
                    onChange={(e) => setForm({ ...form, experienceYears: Number(e.target.value) })}
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
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                  />
                )}
              </Field>
            </div>
            <Field label={t('specializations')} hint={t('commaSeparated')}>
              {(p) => (
                <Input
                  {...p}
                  value={form.specializations}
                  onChange={(e) => setForm({ ...form, specializations: e.target.value })}
                />
              )}
            </Field>
            <Field label={t('certifications')} hint={t('onePerLine')}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={3}
                  value={form.certifications}
                  onChange={(e) => setForm({ ...form, certifications: e.target.value })}
                />
              )}
            </Field>
            <label className="flex items-center justify-between text-sm">
              {t('offersPt')}{' '}
              <Switch
                checked={form.offersPersonalTraining}
                onCheckedChange={(v) => setForm({ ...form, offersPersonalTraining: v })}
              />
            </label>
            <label className="flex items-center justify-between text-sm">
              {t('isPublic')}{' '}
              <Switch checked={form.isPublic} onCheckedChange={(v) => setForm({ ...form, isPublic: v })} />
            </label>
            <p className="text-xs text-muted">{t('accountNote')}</p>
          </div>
        </DialogBody>
        <DialogFooter>
          {trainer && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => active.mutate(!trainer.isActive)}>
              {trainer.isActive ? t('deactivate') : t('activate')}
            </Button>
          )}
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

function AvailabilityDialog({ trainer, onClose }: { trainer: TrainerRow; onClose: () => void }) {
  const t = useTranslations('admin.trainers');
  const days = useTranslations('weekdays');
  const detail = useQuery({
    queryKey: ['admin-trainer', trainer.id],
    queryFn: () =>
      api.get<{ availability: { weekday: number; startMinute: number; endMinute: number; branchId: string }[] }>(
        `/admin/trainers/${trainer.id}`,
      ),
  });
  const [slots, setSlots] = useState<
    { weekday: number; startTime: string; endTime: string; branchId: string }[] | null
  >(null);
  const current =
    slots ??
    detail.data?.availability.map((a) => ({
      weekday: a.weekday,
      startTime: minutesToHHMM(a.startMinute),
      endTime: minutesToHHMM(a.endMinute),
      branchId: a.branchId,
    })) ??
    [];
  const save = useAdminMutation(() => api.put(`/admin/trainers/${trainer.id}/availability`, { slots: current }), {
    invalidate: [['admin-trainer', trainer.id]],
    revalidateSite: true,
    success: t('saved'),
    onSuccess: onClose,
  });
  const update = (i: number, patch: Partial<(typeof current)[number]>) =>
    setSlots(current.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title={t('availabilityTitle', { name: trainer.displayName })}
          description={t('availabilityLead')}
        />
        <DialogBody className="space-y-2">
          {detail.isLoading ? (
            <Skeleton className="h-32" />
          ) : (
            <>
              {current.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  <Select
                    aria-label={t('day')}
                    value={s.weekday}
                    onChange={(e) => update(i, { weekday: Number(e.target.value) })}
                  >
                    {Array.from({ length: 7 }, (_, d) => (
                      <option key={d} value={d}>
                        {days(String(d))}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="time"
                    aria-label={t('from')}
                    value={s.startTime}
                    onChange={(e) => update(i, { startTime: e.target.value })}
                  />
                  <Input
                    type="time"
                    aria-label={t('to')}
                    value={s.endTime}
                    onChange={(e) => update(i, { endTime: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSlots(current.filter((_, j) => j !== i))}
                    aria-label={t('remove')}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSlots([
                    ...current,
                    { weekday: 0, startTime: '09:00', endTime: '18:00', branchId: trainer.branchId },
                  ])
                }
              >
                <Plus /> {t('addSlot')}
              </Button>
            </>
          )}
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

function Workload() {
  const t = useTranslations('admin.trainers');
  const fmt = useFmt();
  const [range, setRange] = useState(defaultRange(30));
  const { data, isLoading } = useQuery({
    queryKey: ['trainer-workload', range.from, range.to],
    queryFn: () =>
      api.get<{
        trainers: {
          id: string;
          displayName: string;
          sessions: number;
          hours: number;
          fillRate: number | null;
          attendanceRate: number | null;
          assignedMembers: number;
          activePrograms: number;
        }[];
      }>(`/admin/trainers/workload${qs({ from: range.from, to: range.to })}`),
  });
  return (
    <>
      <div className="mb-4">
        <RangePicker value={range} onChange={setRange} showTest={false} />
      </div>
      <Card>
        {isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('trainer')}</Th>
                <Th className="text-right">{t('sessionsCol')}</Th>
                <Th className="text-right">{t('hours')}</Th>
                <Th className="text-right">{t('fill')}</Th>
                <Th className="text-right">{t('attendance')}</Th>
                <Th className="text-right">{t('clientsCol')}</Th>
                <Th className="text-right">{t('programs')}</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.trainers ?? []).map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.displayName}</Td>
                  <Td className="text-right tabular-nums">{r.sessions}</Td>
                  <Td className="text-right tabular-nums">{r.hours}</Td>
                  <Td className="text-right tabular-nums">{fmt.percent(r.fillRate)}</Td>
                  <Td className="text-right tabular-nums">{fmt.percent(r.attendanceRate)}</Td>
                  <Td className="text-right tabular-nums">{r.assignedMembers}</Td>
                  <Td className="text-right tabular-nums">{r.activePrograms}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="border-t border-border px-5 py-3 text-xs text-muted">{t('workloadNote')}</p>
      </Card>
    </>
  );
}
