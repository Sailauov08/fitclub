'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CalendarPlus, ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import {
  addDaysToKey,
  localDateKey,
  localWeekday,
  minutesToHHMM,
  zonedDateTime,
  type LocalizedText,
} from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import type { SessionItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { AdminPage, issuesToMap, useAdminMutation } from '@/components/admin/kit';
import { useBranches, useTrainers } from '@/components/admin/hooks';
import { cn } from '@/lib/utils';

interface ClassTypeOption {
  id: string;
  name: LocalizedText;
  durationMinutes: number;
  defaultCapacity: number;
  isArchived: boolean;
}
interface ScheduleRow {
  id: string;
  classTypeId: string;
  trainerId: string;
  roomId: string;
  branchId: string;
  weekday: number;
  startMinute: number;
  durationMinutes: number;
  capacity: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  classType: { name: LocalizedText };
  trainer: { displayName: string };
  room: { name: LocalizedText };
  branch: { name: LocalizedText };
  _count: { sessions: number };
}

const startOfWeek = (key: string) => addDaysToKey(key, -localWeekday(zonedDateTime(key, 12 * 60)));

export default function AdminSchedulePage() {
  const t = useTranslations('admin.schedule');
  const can = useCan();
  return (
    <AdminPage title={t('title')} description={t('lead')}>
      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">{t('calendar')}</TabsTrigger>
          <TabsTrigger value="recurring">{t('recurring')}</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar">
          <Calendar canManage={can('schedule.manage')} />
        </TabsContent>
        <TabsContent value="recurring">
          <Recurring canManage={can('schedule.manage')} />
        </TabsContent>
      </Tabs>
    </AdminPage>
  );
}

function Calendar({ canManage }: { canManage: boolean }) {
  const t = useTranslations('admin.schedule');
  const days = useTranslations('weekdays');
  const fmt = useFmt();
  const branches = useBranches();
  const trainers = useTrainers();
  const today = localDateKey(new Date());
  const [start, setStart] = useState(startOfWeek(today));
  const [branchId, setBranchId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-sessions', start, branchId, trainerId],
    queryFn: () =>
      api.get<{ sessions: SessionItem[] }>(
        `/admin/sessions${qs({ from: start, to: addDaysToKey(start, 6), branchId, trainerId })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i)), [start]);
  const byDay = (key: string) => (data?.sessions ?? []).filter((s) => localDateKey(new Date(s.startsAt)) === key);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setStart(addDaysToKey(start, -7))} aria-label={t('prev')}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon" onClick={() => setStart(addDaysToKey(start, 7))} aria-label={t('next')}>
          <ChevronRight />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setStart(startOfWeek(today))}>
          {t('thisWeek')}
        </Button>
        <span className="text-sm font-semibold">
          {fmt.date(zonedDateTime(start, 720))} — {fmt.date(zonedDateTime(addDaysToKey(start, 6), 720))}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select
            aria-label={t('branch')}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-48"
          >
            <option value="">{t('allBranches')}</option>
            {(branches.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {fmt.t(b.name)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('trainer')}
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value)}
            className="w-48"
          >
            <option value="">{t('allTrainers')}</option>
            {(trainers.data ?? []).map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.displayName}
              </option>
            ))}
          </Select>
          {canManage && (
            <Button onClick={() => setCreating(true)}>
              <CalendarPlus /> {t('newSession')}
            </Button>
          )}
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-[560px]" />
      ) : (
        <div className="grid gap-3 md:grid-cols-7">
          {columns.map((key, i) => (
            <div
              key={key}
              className={cn(
                'min-h-40 rounded-xl border border-border bg-surface p-2',
                key === today && 'border-primary/50',
              )}
            >
              <p
                className={cn(
                  'px-1.5 pb-2 text-xs font-semibold uppercase tracking-wider',
                  key === today ? 'text-primary' : 'text-muted',
                )}
              >
                {days(String(i))}{' '}
                <span className="font-normal">
                  {key.slice(8)}.{key.slice(5, 7)}
                </span>
              </p>
              <ul className="space-y-1.5">
                {byDay(key).map((s) => {
                  const fill = s.capacity ? s.bookedCount / s.capacity : 0;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/admin/schedule/${s.id}`}
                        className={cn(
                          'block rounded-lg border border-border bg-background p-2 text-xs transition-colors hover:border-foreground',
                          s.status === 'CANCELLED' && 'opacity-50 line-through',
                        )}
                      >
                        <p className="font-semibold tabular-nums">{fmt.time(s.startsAt)}</p>
                        <p className="truncate font-medium">{fmt.t(s.classType.name)}</p>
                        <p className="truncate text-muted">{s.trainer.displayName}</p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className={cn(
                                'h-full',
                                fill >= 1 ? 'bg-danger' : fill > 0.75 ? 'bg-warning' : 'bg-success',
                              )}
                              style={{ width: `${Math.min(100, fill * 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-muted">
                            {s.bookedCount}/{s.capacity}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {creating && <SessionDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function useClassTypes() {
  return useQuery({ queryKey: ['admin-class-types'], queryFn: () => api.get<ClassTypeOption[]>('/admin/class-types') });
}

function SessionDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('admin.schedule');
  const fmt = useFmt();
  const branches = useBranches();
  const trainers = useTrainers();
  const types = useClassTypes();
  const rooms = (branches.data ?? []).flatMap((b) =>
    b.rooms.filter((r) => r.isActive).map((r) => ({ ...r, branchName: b.name })),
  );
  const [form, setForm] = useState({
    classTypeId: '',
    trainerId: '',
    roomId: '',
    date: localDateKey(new Date()),
    startTime: '18:00',
    durationMinutes: 60,
    capacity: 12,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useAdminMutation(() => api.post('/admin/sessions', form), {
    invalidate: [['admin-sessions']],
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
        <DialogHeader title={t('newSession')} description={t('newSessionLead')} />
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('classType')} error={errors.classTypeId} className="sm:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={form.classTypeId}
                onChange={(e) => {
                  const ct = types.data?.find((x) => x.id === e.target.value);
                  setForm({
                    ...form,
                    classTypeId: e.target.value,
                    durationMinutes: ct?.durationMinutes ?? form.durationMinutes,
                    capacity: ct?.defaultCapacity ?? form.capacity,
                  });
                }}
              >
                <option value="">—</option>
                {(types.data ?? [])
                  .filter((x) => !x.isArchived)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {fmt.t(x.name)}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t('trainer')} error={errors.trainerId}>
            {(p) => (
              <Select {...p} value={form.trainerId} onChange={(e) => setForm({ ...form, trainerId: e.target.value })}>
                <option value="">—</option>
                {(trainers.data ?? [])
                  .filter((x) => x.isActive)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.displayName}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t('room')} error={errors.roomId}>
            {(p) => (
              <Select {...p} value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                <option value="">—</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {fmt.t(r.branchName)} · {fmt.t(r.name)} ({r.capacity})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('date')} error={errors.date}>
            {(p) => (
              <Input
                {...p}
                type="date"
                min={localDateKey(new Date())}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('startTime')} error={errors.startTime}>
            {(p) => (
              <Input
                {...p}
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('duration')} error={errors.durationMinutes}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={15}
                max={240}
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field label={t('capacity')} error={errors.capacity}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
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

function Recurring({ canManage }: { canManage: boolean }) {
  const t = useTranslations('admin.schedule');
  const days = useTranslations('weekdays');
  const fmt = useFmt();
  const [editing, setEditing] = useState<ScheduleRow | 'new' | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-schedules'],
    queryFn: () => api.get<ScheduleRow[]>('/admin/schedules'),
  });
  const deactivate = useAdminMutation(
    (id: string) => api.post<{ removed: number }>(`/admin/schedules/${id}/deactivate`),
    { invalidate: [['admin-schedules'], ['admin-sessions']], success: t('deactivated') },
  );
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <p className="text-sm text-muted">{t('recurringLead')}</p>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Repeat /> {t('newSchedule')}
          </Button>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="m-5 h-48" />
      ) : !data?.length ? (
        <EmptyState title={t('noSchedules')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('when')}</Th>
              <Th>{t('classType')}</Th>
              <Th>{t('trainer')}</Th>
              <Th>{t('room')}</Th>
              <Th>{t('capacity')}</Th>
              <Th>{t('validity')}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} className={cn(!s.isActive && 'opacity-50')}>
                <Td className="whitespace-nowrap font-medium">
                  {days(String(s.weekday))} {minutesToHHMM(s.startMinute)}
                  <span className="block text-xs text-muted">{t('minutes', { count: s.durationMinutes })}</span>
                </Td>
                <Td>{fmt.t(s.classType.name)}</Td>
                <Td>{s.trainer.displayName}</Td>
                <Td>
                  {fmt.t(s.room.name)} <span className="block text-xs text-muted">{fmt.t(s.branch.name)}</span>
                </Td>
                <Td>{s.capacity}</Td>
                <Td className="whitespace-nowrap text-xs text-muted">
                  {s.validFrom.slice(0, 10)} → {s.validUntil ? s.validUntil.slice(0, 10) : '∞'}
                </Td>
                <Td className="text-right">
                  {s.isActive ? (
                    canManage && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                          {t('edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          onClick={() => deactivate.mutate(s.id)}
                        >
                          {t('deactivate')}
                        </Button>
                      </div>
                    )
                  ) : (
                    <Badge>{t('inactive')}</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <ScheduleDialog schedule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function ScheduleDialog({ schedule, onClose }: { schedule: ScheduleRow | null; onClose: () => void }) {
  const t = useTranslations('admin.schedule');
  const days = useTranslations('weekdays');
  const fmt = useFmt();
  const branches = useBranches();
  const trainers = useTrainers();
  const types = useClassTypes();
  const rooms = (branches.data ?? []).flatMap((b) =>
    b.rooms.filter((r) => r.isActive).map((r) => ({ ...r, branchName: b.name })),
  );
  const [form, setForm] = useState({
    classTypeId: schedule?.classTypeId ?? '',
    trainerId: schedule?.trainerId ?? '',
    roomId: schedule?.roomId ?? '',
    weekday: schedule?.weekday ?? 0,
    startTime: schedule ? minutesToHHMM(schedule.startMinute) : '18:00',
    durationMinutes: schedule?.durationMinutes ?? 60,
    capacity: schedule?.capacity ?? 12,
    validFrom: schedule?.validFrom.slice(0, 10) ?? localDateKey(new Date()),
    validUntil: schedule?.validUntil?.slice(0, 10) ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminMutation(
    () =>
      schedule
        ? api.put(`/admin/schedules/${schedule.id}`, { ...form, validUntil: form.validUntil || null })
        : api.post('/admin/schedules', { ...form, validUntil: form.validUntil || null }),
    {
      invalidate: [['admin-schedules'], ['admin-sessions']],
      success: t('saved'),
      onSuccess: onClose,
      onError: (e) => {
        const map = issuesToMap(e);
        setErrors(map);
        return Object.keys(map).length > 0;
      },
    },
  );
  const locked = Boolean(schedule);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader
          title={schedule ? t('editSchedule') : t('newSchedule')}
          description={locked ? t('timeLocked') : t('newScheduleLead')}
        />
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('classType')} error={errors.classTypeId} className="sm:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={form.classTypeId}
                onChange={(e) => setForm({ ...form, classTypeId: e.target.value })}
              >
                <option value="">—</option>
                {(types.data ?? [])
                  .filter((x) => !x.isArchived)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {fmt.t(x.name)}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t('trainer')} error={errors.trainerId}>
            {(p) => (
              <Select {...p} value={form.trainerId} onChange={(e) => setForm({ ...form, trainerId: e.target.value })}>
                <option value="">—</option>
                {(trainers.data ?? [])
                  .filter((x) => x.isActive)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.displayName}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t('room')} error={errors.roomId}>
            {(p) => (
              <Select {...p} value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                <option value="">—</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {fmt.t(r.branchName)} · {fmt.t(r.name)} ({r.capacity})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('weekday')} error={errors.weekday}>
            {(p) => (
              <Select
                {...p}
                value={form.weekday}
                disabled={locked}
                onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
              >
                {Array.from({ length: 7 }, (_, i) => (
                  <option key={i} value={i}>
                    {days(String(i))}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('startTime')} error={errors.startTime}>
            {(p) => (
              <Input
                {...p}
                type="time"
                disabled={locked}
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('duration')} error={errors.durationMinutes}>
            {(p) => (
              <Input
                {...p}
                type="number"
                disabled={locked}
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field label={t('capacity')} error={errors.capacity}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field label={t('validFrom')} error={errors.validFrom}>
            {(p) => (
              <Input
                {...p}
                type="date"
                disabled={locked}
                value={form.validFrom}
                onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('validUntil')} hint={t('validUntilHint')} error={errors.validUntil}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              />
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
