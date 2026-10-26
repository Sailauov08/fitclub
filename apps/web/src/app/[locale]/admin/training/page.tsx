'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Dumbbell, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import {
  DIFFICULTIES,
  EXERCISE_CATEGORIES,
  localDateKey,
  type Difficulty,
  type ExerciseCategory,
  type LocalizedText,
} from '@fitclub/shared';
import { api, qs } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Badge, Card, CardHeader, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import {
  AdminPage,
  emptyText,
  issuesToMap,
  LocalizedField,
  SearchInput,
  useAdminMutation,
} from '@/components/admin/kit';

interface Exercise {
  id: string;
  name: LocalizedText;
  category: ExerciseCategory;
  muscleGroups: string[];
  equipment: string;
  instructions: LocalizedText;
  videoUrl: string | null;
  isActive: boolean;
}
interface ProgramRow {
  id: string;
  name: string;
  level: Difficulty;
  durationWeeks: number;
  isTemplate: boolean;
  status: string;
  trainer: { displayName: string };
  _count: { assignments: number; days: number };
}
interface ProgramDetail {
  id: string;
  name: string;
  description: string;
  goal: string;
  level: Difficulty;
  durationWeeks: number;
  isTemplate: boolean;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  days: {
    title: string;
    weekday: number | null;
    notes: string;
    exercises: {
      exerciseId: string;
      sets: number;
      reps: number | null;
      durationSeconds: number | null;
      restSeconds: number;
      notes: string;
    }[];
  }[];
  assignments: {
    id: string;
    status: string;
    startDate: string;
    member: { id: string; memberNumber: number; user: { profile: { firstName: string; lastName: string } | null } };
    _count: { workoutLogs: number };
  }[];
}

export default function TrainingAdmin() {
  const t = useTranslations('admin.training');
  const can = useCan();
  return (
    <AdminPage title={t('title')} description={t('lead')}>
      <Tabs defaultValue="programs">
        <TabsList>
          <TabsTrigger value="programs">{t('programs')}</TabsTrigger>
          <TabsTrigger value="exercises">{t('exercises')}</TabsTrigger>
        </TabsList>
        <TabsContent value="programs">
          <Programs />
        </TabsContent>
        <TabsContent value="exercises">
          <Exercises canEdit={can('exercises.manage')} />
        </TabsContent>
      </Tabs>
    </AdminPage>
  );
}

function useExercises() {
  return useQuery({ queryKey: ['admin-exercises'], queryFn: () => api.get<Exercise[]>('/admin/exercises') });
}

function Programs() {
  const t = useTranslations('admin.training');
  const classesT = useTranslations('classes');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-programs'],
    queryFn: () => api.get<ProgramRow[]>('/admin/programs'),
  });
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [assigning, setAssigning] = useState<ProgramRow | null>(null);
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> {t('newProgram')}
        </Button>
      </div>
      <Card>
        {isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : !data?.length ? (
          <EmptyState icon={<Dumbbell />} title={t('noPrograms')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('program')}</Th>
                <Th>{t('coach')}</Th>
                <Th>{t('level')}</Th>
                <Th>{t('assigned')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <p className="flex items-center gap-2 font-semibold">
                      {p.name}
                      {p.isTemplate && <Badge tone="info">{t('template')}</Badge>}
                      {p.status !== 'ACTIVE' && <Badge>{t(`status.${p.status}`)}</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {t('daysWeeks', { days: p._count.days, weeks: p.durationWeeks })}
                    </p>
                  </Td>
                  <Td>{p.trainer.displayName}</Td>
                  <Td>{classesT(`difficulty.${p.level}`)}</Td>
                  <Td>{p._count.assignments}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {p.status === 'ACTIVE' && (
                        <Button size="sm" variant="outline" onClick={() => setAssigning(p)}>
                          <UserPlus /> {t('assign')}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p.id)} aria-label={t('edit')}>
                        <Pencil />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <ProgramBuilder programId={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {assigning && <AssignDialog program={assigning} onClose={() => setAssigning(null)} />}
    </>
  );
}

type DayForm = ProgramDetail['days'][number];

function ProgramBuilder({ programId, onClose }: { programId: string | null; onClose: () => void }) {
  const t = useTranslations('admin.training');
  const classesT = useTranslations('classes');
  const days = useTranslations('weekdays');
  const fmt = useFmt();
  const exercises = useExercises();
  const existing = useQuery({
    queryKey: ['admin-program', programId],
    queryFn: () => api.get<ProgramDetail>(`/admin/programs/${programId}`),
    enabled: Boolean(programId),
  });
  const [form, setForm] = useState<Omit<ProgramDetail, 'id' | 'assignments'> | null>(
    programId
      ? null
      : {
          name: '',
          description: '',
          goal: '',
          level: 'BEGINNER',
          durationWeeks: 4,
          isTemplate: false,
          status: 'ACTIVE',
          days: [{ title: 'Day 1', weekday: 0, notes: '', exercises: [] }],
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const data =
    form ??
    (existing.data
      ? {
          name: existing.data.name,
          description: existing.data.description,
          goal: existing.data.goal,
          level: existing.data.level,
          durationWeeks: existing.data.durationWeeks,
          isTemplate: existing.data.isTemplate,
          status: existing.data.status,
          days: existing.data.days.map((d) => ({
            title: d.title,
            weekday: d.weekday,
            notes: d.notes,
            exercises: d.exercises.map((e) => ({
              exerciseId: e.exerciseId,
              sets: e.sets,
              reps: e.reps,
              durationSeconds: e.durationSeconds,
              restSeconds: e.restSeconds,
              notes: e.notes,
            })),
          })),
        }
      : null);
  const set = (patch: Partial<NonNullable<typeof data>>) => setForm({ ...data!, ...patch });
  const setDay = (i: number, patch: Partial<DayForm>) =>
    set({ days: data!.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const save = useAdminMutation(
    () => (programId ? api.put(`/admin/programs/${programId}`, data) : api.post('/admin/programs', data)),
    {
      invalidate: [['admin-programs'], ['admin-program', programId]],
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
        <DialogHeader title={programId ? t('editProgram') : t('newProgram')} description={t('builderLead')} />
        <DialogBody className="space-y-6">
          {!data ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Field label={t('name')} error={errors.name} className="md:col-span-2">
                  {(p) => <Input {...p} value={data.name} onChange={(e) => set({ name: e.target.value })} />}
                </Field>
                <Field label={t('level')}>
                  {(p) => (
                    <Select {...p} value={data.level} onChange={(e) => set({ level: e.target.value as Difficulty })}>
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>
                          {classesT(`difficulty.${d}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t('weeks')}>
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={1}
                      max={52}
                      value={data.durationWeeks}
                      onChange={(e) => set({ durationWeeks: Number(e.target.value) })}
                    />
                  )}
                </Field>
                <Field label={t('goal')} className="md:col-span-2">
                  {(p) => <Input {...p} value={data.goal} onChange={(e) => set({ goal: e.target.value })} />}
                </Field>
                <Field label={t('statusLabel')}>
                  {(p) => (
                    <Select
                      {...p}
                      value={data.status}
                      onChange={(e) => set({ status: e.target.value as ProgramDetail['status'] })}
                    >
                      {(['DRAFT', 'ACTIVE', 'ARCHIVED'] as const).map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <label className="flex items-end justify-between gap-2 pb-2 text-sm">
                  {t('isTemplate')} <Switch checked={data.isTemplate} onCheckedChange={(v) => set({ isTemplate: v })} />
                </label>
                <Field label={t('description')} className="md:col-span-4">
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={2}
                      value={data.description}
                      onChange={(e) => set({ description: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              {data.days.map((day, i) => (
                <Card key={i} className="p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
                    <Input
                      aria-label={t('dayTitle')}
                      value={day.title}
                      onChange={(e) => setDay(i, { title: e.target.value })}
                    />
                    <Select
                      aria-label={t('weekday')}
                      value={day.weekday ?? ''}
                      onChange={(e) => setDay(i, { weekday: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      <option value="">{t('anyDay')}</option>
                      {Array.from({ length: 7 }, (_, d) => (
                        <option key={d} value={d}>
                          {days(String(d))}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => set({ days: data.days.filter((_, j) => j !== i) })}
                      disabled={data.days.length === 1}
                      aria-label={t('removeDay')}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {errors[`days.${i}.exercises`] && <p className="mt-2 text-xs text-danger">{t('needExercise')}</p>}
                  <div className="mt-3 space-y-2">
                    {day.exercises.map((ex, k) => (
                      <div key={k} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_repeat(4,1fr)_auto]">
                        <Select
                          aria-label={t('exercise')}
                          value={ex.exerciseId}
                          onChange={(e) =>
                            setDay(i, {
                              exercises: day.exercises.map((x, j) =>
                                j === k ? { ...x, exerciseId: e.target.value } : x,
                              ),
                            })
                          }
                          className="col-span-2 sm:col-span-1"
                        >
                          {(exercises.data ?? [])
                            .filter((x) => x.isActive)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {fmt.t(x.name)}
                              </option>
                            ))}
                        </Select>
                        <Input
                          aria-label={t('sets')}
                          placeholder={t('sets')}
                          type="number"
                          min={1}
                          value={ex.sets}
                          onChange={(e) =>
                            setDay(i, {
                              exercises: day.exercises.map((x, j) =>
                                j === k ? { ...x, sets: Number(e.target.value) } : x,
                              ),
                            })
                          }
                        />
                        <Input
                          aria-label={t('reps')}
                          placeholder={t('reps')}
                          type="number"
                          min={1}
                          value={ex.reps ?? ''}
                          onChange={(e) =>
                            setDay(i, {
                              exercises: day.exercises.map((x, j) =>
                                j === k ? { ...x, reps: e.target.value ? Number(e.target.value) : null } : x,
                              ),
                            })
                          }
                        />
                        <Input
                          aria-label={t('seconds')}
                          placeholder={t('seconds')}
                          type="number"
                          min={5}
                          value={ex.durationSeconds ?? ''}
                          onChange={(e) =>
                            setDay(i, {
                              exercises: day.exercises.map((x, j) =>
                                j === k ? { ...x, durationSeconds: e.target.value ? Number(e.target.value) : null } : x,
                              ),
                            })
                          }
                        />
                        <Input
                          aria-label={t('rest')}
                          placeholder={t('rest')}
                          type="number"
                          min={0}
                          value={ex.restSeconds}
                          onChange={(e) =>
                            setDay(i, {
                              exercises: day.exercises.map((x, j) =>
                                j === k ? { ...x, restSeconds: Number(e.target.value) } : x,
                              ),
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDay(i, { exercises: day.exercises.filter((_, j) => j !== k) })}
                          aria-label={t('remove')}
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!exercises.data?.length}
                      onClick={() =>
                        setDay(i, {
                          exercises: [
                            ...day.exercises,
                            {
                              exerciseId: exercises.data![0]!.id,
                              sets: 3,
                              reps: 10,
                              durationSeconds: null,
                              restSeconds: 60,
                              notes: '',
                            },
                          ],
                        })
                      }
                    >
                      <Plus /> {t('addExercise')}
                    </Button>
                  </div>
                </Card>
              ))}
              {data.days.length < 7 && (
                <Button
                  variant="outline"
                  onClick={() =>
                    set({
                      days: [
                        ...data.days,
                        { title: `Day ${data.days.length + 1}`, weekday: null, notes: '', exercises: [] },
                      ],
                    })
                  }
                >
                  <Plus /> {t('addDay')}
                </Button>
              )}
              {existing.data && existing.data.assignments.length > 0 && (
                <Card>
                  <CardHeader title={t('assignments')} />
                  <ul className="divide-y divide-border text-sm">
                    {existing.data.assignments.map((a) => (
                      <li key={a.id} className="flex justify-between px-5 py-2.5">
                        <span>
                          {a.member.user.profile?.firstName} {a.member.user.profile?.lastName}
                        </span>
                        <span className="text-muted">
                          {t('logs', { count: a._count.workoutLogs })} · {a.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!data}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ program, onClose }: { program: ProgramRow; onClose: () => void }) {
  const t = useTranslations('admin.training');
  const [q, setQ] = useState('');
  const [memberId, setMemberId] = useState('');
  const [startDate, setStartDate] = useState(localDateKey(new Date()));
  const [memberInstructions, setInstructions] = useState('');
  const [trainerNotes, setNotes] = useState('');
  const results = useQuery({
    queryKey: ['assign-search', q],
    queryFn: () =>
      api.get<
        Paginated<{
          id: string;
          memberNumber: number;
          user: { profile: { firstName: string; lastName: string } | null };
        }>
      >(`/admin/members${qs({ q, pageSize: 8 })}`),
    enabled: q.trim().length >= 2,
  });
  const assign = useAdminMutation(
    () =>
      api.post(`/admin/programs/${program.id}/assignments`, { memberId, startDate, memberInstructions, trainerNotes }),
    { invalidate: [['admin-programs']], success: t('assignedToast'), onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader title={t('assignTitle', { name: program.name })} />
        <DialogBody className="space-y-4">
          <SearchInput value={q} onChange={setQ} placeholder={t('searchMember')} />
          <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {(results.data?.items ?? []).map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setMemberId(m.id)}
                  className={`flex w-full justify-between px-4 py-2 text-left text-sm hover:bg-surface-2 ${memberId === m.id ? 'bg-surface-2 font-semibold' : ''}`}
                >
                  <span>
                    {m.user.profile?.firstName} {m.user.profile?.lastName}
                  </span>
                  <span className="text-muted">FC-{String(m.memberNumber).padStart(6, '0')}</span>
                </button>
              </li>
            ))}
          </ul>
          <Field label={t('startDate')}>
            {(p) => <Input {...p} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
          </Field>
          <Field label={t('memberInstructions')} hint={t('memberVisible')}>
            {(p) => (
              <Textarea {...p} rows={2} value={memberInstructions} onChange={(e) => setInstructions(e.target.value)} />
            )}
          </Field>
          <Field label={t('trainerNotes')} hint={t('staffOnly')}>
            {(p) => <Textarea {...p} rows={2} value={trainerNotes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => assign.mutate(undefined)} loading={assign.isPending} disabled={!memberId}>
            {t('assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Exercises({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('admin.training');
  const fmt = useFmt();
  const { data, isLoading } = useExercises();
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  return (
    <>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus /> {t('newExercise')}
          </Button>
        </div>
      )}
      <Card>
        {isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('exercise')}</Th>
                <Th>{t('category')}</Th>
                <Th>{t('muscles')}</Th>
                <Th>{t('equipment')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((e) => (
                <tr key={e.id} className={!e.isActive ? 'opacity-50' : undefined}>
                  <Td className="font-medium">{fmt.t(e.name)}</Td>
                  <Td>
                    <Badge>{t(`categories.${e.category}`)}</Badge>
                  </Td>
                  <Td className="text-sm text-muted">{e.muscleGroups.join(', ')}</Td>
                  <Td className="text-sm">{e.equipment || '—'}</Td>
                  <Td className="text-right">
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(e)} aria-label={t('edit')}>
                        <Pencil />
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <ExerciseDialog item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ExerciseDialog({ item, onClose }: { item: Exercise | null; onClose: () => void }) {
  const t = useTranslations('admin.training');
  const [form, setForm] = useState({
    name: item?.name ?? emptyText(),
    category: item?.category ?? ('STRENGTH' as ExerciseCategory),
    muscleGroups: item?.muscleGroups.join(', ') ?? '',
    equipment: item?.equipment ?? '',
    instructions: item?.instructions ?? emptyText(),
    videoUrl: item?.videoUrl ?? null,
    isActive: item?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const body = () => ({
    ...form,
    muscleGroups: form.muscleGroups
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  });
  const save = useAdminMutation(
    () => (item ? api.put(`/admin/exercises/${item.id}`, body()) : api.post('/admin/exercises', body())),
    {
      invalidate: [['admin-exercises']],
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
        <DialogHeader title={item ? t('editExercise') : t('newExercise')} />
        <DialogBody className="space-y-4">
          <LocalizedField
            label={t('name')}
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            error={errors.name}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('category')}>
              {(p) => (
                <Select
                  {...p}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as ExerciseCategory })}
                >
                  {EXERCISE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('equipment')}>
              {(p) => (
                <Input
                  {...p}
                  value={form.equipment}
                  onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                />
              )}
            </Field>
          </div>
          <Field label={t('muscles')} hint={t('commaSeparated')}>
            {(p) => (
              <Input
                {...p}
                value={form.muscleGroups}
                onChange={(e) => setForm({ ...form, muscleGroups: e.target.value })}
              />
            )}
          </Field>
          <LocalizedField
            label={t('instructions')}
            value={form.instructions}
            onChange={(instructions) => setForm({ ...form, instructions })}
            multiline
          />
          <label className="flex items-center justify-between text-sm">
            {t('active')} <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
          </label>
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
