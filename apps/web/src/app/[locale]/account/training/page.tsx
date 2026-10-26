'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dumbbell, NotebookPen, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText } from '@fitclub/shared';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Badge, Card, CardHeader, EmptyState, Skeleton, Stat } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { useErrorMessage } from '@/components/providers';
import { PageTitle } from '@/components/account/shell';

interface ProgramExercise {
  id: string;
  exerciseId: string;
  sets: number;
  reps: number | null;
  durationSeconds: number | null;
  restSeconds: number;
  notes: string;
  exercise: { name: LocalizedText; equipment: string };
}
interface Assignment {
  id: string;
  status: string;
  startDate: string;
  memberInstructions: string;
  trainer: { displayName: string };
  program: {
    id: string;
    name: string;
    description: string;
    goal: string;
    level: string;
    durationWeeks: number;
    days: { id: string; title: string; notes: string; exercises: ProgramExercise[] }[];
  };
  _count: { workoutLogs: number };
}
interface Workouts {
  logs: {
    id: string;
    completedAt: string;
    durationMinutes: number | null;
    perceivedEffort: number | null;
    notes: string;
    day: { title: string };
    assignment: { program: { name: string } };
    sets: { id: string }[];
  }[];
  progress: {
    totalWorkouts: number;
    weekly: { week: string; workouts: number; volumeKg: number }[];
    bestLifts: { exerciseId: string; name: LocalizedText; weightKg: number }[];
  };
}

export default function TrainingPage() {
  const t = useTranslations('account.training');
  const classesT = useTranslations('classes');
  const fmt = useFmt();
  const programs = useQuery({ queryKey: ['my-programs'], queryFn: () => api.get<Assignment[]>('/me/programs') });
  const workouts = useQuery({ queryKey: ['my-workouts'], queryFn: () => api.get<Workouts>('/me/workouts') });
  const [logFor, setLogFor] = useState<{ assignment: Assignment; dayId: string } | null>(null);

  return (
    <>
      <PageTitle title={t('title')} description={t('lead')} />
      {workouts.data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label={t('totalWorkouts')} value={workouts.data.progress.totalWorkouts} icon={<NotebookPen />} />
          <Stat label={t('thisWeek')} value={workouts.data.progress.weekly.at(-1)?.workouts ?? 0} icon={<Dumbbell />} />
          <Stat
            label={t('bestLift')}
            value={workouts.data.progress.bestLifts[0] ? `${workouts.data.progress.bestLifts[0].weightKg} kg` : '—'}
            hint={workouts.data.progress.bestLifts[0] ? fmt.t(workouts.data.progress.bestLifts[0].name) : undefined}
            icon={<Trophy />}
          />
        </div>
      )}
      {programs.isLoading ? (
        <Skeleton className="h-72" />
      ) : !programs.data?.length ? (
        <Card>
          <EmptyState icon={<Dumbbell />} title={t('none')} description={t('noneBody')} />
        </Card>
      ) : (
        <div className="space-y-6">
          {programs.data.map((a) => (
            <Card key={a.id}>
              <CardHeader
                title={a.program.name}
                description={`${t('coach', { name: a.trainer.displayName })} · ${classesT(`difficulty.${a.program.level}`)} · ${t('weeks', { count: a.program.durationWeeks })}`}
                action={<Badge tone={a.status === 'ACTIVE' ? 'success' : 'neutral'}>{t(`status.${a.status}`)}</Badge>}
              />
              <div className="space-y-5 p-5">
                {a.memberInstructions && <p className="rounded-lg bg-surface-2 p-4 text-sm">{a.memberInstructions}</p>}
                <div className="grid gap-4 lg:grid-cols-3">
                  {a.program.days.map((d) => (
                    <div key={d.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{d.title}</p>
                        {a.status === 'ACTIVE' && (
                          <Button size="sm" variant="outline" onClick={() => setLogFor({ assignment: a, dayId: d.id })}>
                            {t('log')}
                          </Button>
                        )}
                      </div>
                      <ol className="mt-3 space-y-2 text-sm">
                        {d.exercises.map((e) => (
                          <li key={e.id} className="flex justify-between gap-3">
                            <span>{fmt.t(e.exercise.name)}</span>
                            <span className="shrink-0 tabular-nums text-muted">
                              {e.sets}×{e.reps ?? `${e.durationSeconds}s`}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('weeklyVolume')} />
          <div className="h-64 p-4">
            {workouts.data?.progress.weekly.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workouts.data.progress.weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" tickFormatter={(v: string) => v.slice(5)} stroke="var(--muted)" fontSize={12} />
                  <YAxis stroke="var(--muted)" fontSize={12} width={48} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                  />
                  <Bar dataKey="volumeKg" name={t('volume')} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title={t('noData')} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t('history')} />
          {!workouts.data?.logs.length ? (
            <EmptyState title={t('noLogs')} />
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {workouts.data.logs.map((l) => (
                <li key={l.id} className="px-5 py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold">{l.day.title}</span>
                    <span className="text-muted">{fmt.date(l.completedAt)}</span>
                  </div>
                  <p className="text-muted">
                    {l.assignment.program.name} · {t('sets', { count: l.sets.length })}
                    {l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}
                    {l.perceivedEffort ? ` · RPE ${l.perceivedEffort}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {logFor && (
        <LogWorkoutDialog assignment={logFor.assignment} dayId={logFor.dayId} onClose={() => setLogFor(null)} />
      )}
    </>
  );
}

function LogWorkoutDialog({
  assignment,
  dayId,
  onClose,
}: {
  assignment: Assignment;
  dayId: string;
  onClose: () => void;
}) {
  const t = useTranslations('account.training');
  const fmt = useFmt();
  const qc = useQueryClient();
  const message = useErrorMessage();
  const [day, setDay] = useState(dayId);
  const current = assignment.program.days.find((d) => d.id === day)!;
  const [values, setValues] = useState<Record<string, { reps: string; weight: string }>>({});
  const [duration, setDuration] = useState('');
  const [effort, setEffort] = useState('');
  const [notes, setNotes] = useState('');
  const key = (exerciseId: string, set: number) => `${exerciseId}:${set}`;

  const save = useMutation({
    mutationFn: () =>
      api.post(`/me/programs/${assignment.id}/workouts`, {
        programDayId: day,
        durationMinutes: duration ? Number(duration) : null,
        perceivedEffort: effort ? Number(effort) : null,
        notes,
        sets: current.exercises.flatMap((e) =>
          Array.from({ length: e.sets }, (_, i) => {
            const v = values[key(e.exerciseId, i + 1)];
            return {
              exerciseId: e.exerciseId,
              setIndex: i + 1,
              reps: v?.reps ? Number(v.reps) : e.reps,
              weightKg: v?.weight ? Number(v.weight) : null,
              durationSeconds: e.durationSeconds,
            };
          }),
        ),
      }),
    onSuccess: async () => {
      toast.success(t('logged'));
      await qc.invalidateQueries({ queryKey: ['my-workouts'] });
      onClose();
    },
    onError: (e) => toast.error(message(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader title={t('logTitle')} description={assignment.program.name} />
        <DialogBody className="space-y-5">
          <Field label={t('day')}>
            {(p) => (
              <Select {...p} value={day} onChange={(e) => setDay(e.target.value)}>
                {assignment.program.days.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {current.exercises.map((e) => (
            <div key={e.id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">{fmt.t(e.exercise.name)}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {Array.from({ length: e.sets }, (_, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-10 text-muted">#{i + 1}</span>
                    <Input
                      aria-label={t('reps')}
                      placeholder={String(e.reps ?? '')}
                      inputMode="numeric"
                      value={values[key(e.exerciseId, i + 1)]?.reps ?? ''}
                      onChange={(ev) =>
                        setValues((v) => ({
                          ...v,
                          [key(e.exerciseId, i + 1)]: {
                            reps: ev.target.value,
                            weight: v[key(e.exerciseId, i + 1)]?.weight ?? '',
                          },
                        }))
                      }
                      className="h-9"
                    />
                    <Input
                      aria-label={t('weight')}
                      placeholder="kg"
                      inputMode="decimal"
                      value={values[key(e.exerciseId, i + 1)]?.weight ?? ''}
                      onChange={(ev) =>
                        setValues((v) => ({
                          ...v,
                          [key(e.exerciseId, i + 1)]: {
                            weight: ev.target.value,
                            reps: v[key(e.exerciseId, i + 1)]?.reps ?? '',
                          },
                        }))
                      }
                      className="h-9"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('duration')}>
              {(p) => (
                <Input {...p} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
              )}
            </Field>
            <Field label={t('effort')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  max={10}
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label={t('notes')}>
            {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
