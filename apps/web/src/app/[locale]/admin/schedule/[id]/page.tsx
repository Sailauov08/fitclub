'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Check, Pencil, UserPlus, X, XCircle } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api';
import { useCan, useMe, useNow } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import type { Paginated, SessionItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/controls';
import { Badge, Card, CardHeader, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { AdminPage, ConfirmDialog, SearchInput, useAdminMutation } from '@/components/admin/kit';
import { useBranches, useTrainers } from '@/components/admin/hooks';

interface Attendees {
  session: SessionItem;
  bookings: {
    id: string;
    status: string;
    createdAt: string;
    fromWaitlist: boolean;
    member: {
      id: string;
      memberNumber: number;
      user: {
        email: string;
        profile: { firstName: string; lastName: string; phone: string | null; avatarUrl: string | null } | null;
      };
    };
  }[];
  waitlist: {
    id: string;
    createdAt: string;
    member: { id: string; memberNumber: number; user: { profile: { firstName: string; lastName: string } | null } };
  }[];
}

export default function SessionAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('admin.session');
  const enums = useTranslations('enums.bookingStatus');
  const fmt = useFmt();
  const can = useCan();
  const { data: me } = useMe();
  const now = useNow();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-session', id],
    queryFn: () => api.get<Attendees>(`/admin/sessions/${id}/attendees`),
  });
  const keys = [['admin-session', id], ['admin-sessions']];
  const mark = useAdminMutation(
    ({ bookingId, status }: { bookingId: string; status: 'ATTENDED' | 'NO_SHOW' }) =>
      api.put(`/admin/bookings/${bookingId}/attendance`, { status }),
    { invalidate: keys },
  );
  const cancelBooking = useAdminMutation((bookingId: string) => api.post(`/admin/bookings/${bookingId}/cancel`), {
    invalidate: keys,
    success: t('bookingCancelled'),
  });
  const cancelSession = useAdminMutation(
    (reason: string) => api.post<{ affected: number }>(`/admin/sessions/${id}/cancel`, { reason }),
    {
      invalidate: keys,
      onSuccess: () => setCancelOpen(false),
      success: t('sessionCancelled'),
    },
  );

  if (isLoading) return <Skeleton className="h-96" />;
  if (isError || !data) return <EmptyState title={t('notFound')} />;
  const s = data.session;
  const started = new Date(s.startsAt).getTime() - 30 * 60_000 <= now;
  const canMark =
    can('attendance.mark') && (me?.staff?.role !== 'TRAINER' || me.staff.trainerId === s.trainer.id) && started;
  const active = data.bookings.filter((b) => ['CONFIRMED', 'ATTENDED', 'NO_SHOW'].includes(b.status));

  return (
    <AdminPage
      title={fmt.t(s.classType.name)}
      description={`${fmt.dateTime(s.startsAt)} · ${s.trainer.displayName} · ${fmt.t(s.branch.name)} · ${fmt.t(s.room.name)}`}
      actions={
        s.status === 'SCHEDULED' && (
          <>
            {can('bookings.manage') && (
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                <UserPlus /> {t('addMember')}
              </Button>
            )}
            {can('schedule.manage') && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> {t('edit')}
              </Button>
            )}
            {can('sessions.cancel') && (
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                <XCircle /> {t('cancelSession')}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={s.status === 'CANCELLED' ? 'danger' : s.status === 'COMPLETED' ? 'neutral' : 'success'}>
          {t(`status.${s.status}`)}
        </Badge>
        <Badge>{t('booked', { booked: s.bookedCount, capacity: s.capacity })}</Badge>
        {data.waitlist.length > 0 && (
          <Badge tone="warning">{t('waitlistCount', { count: data.waitlist.length })}</Badge>
        )}
        {s.cancelReason && <Badge tone="danger">{s.cancelReason}</Badge>}
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title={t('attendees')} description={!started ? t('markLater') : undefined} />
          {!data.bookings.length ? (
            <EmptyState title={t('noBookings')} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t('member')}</Th>
                  <Th>{t('statusCol')}</Th>
                  <Th className="text-right">{t('attendance')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.bookings.map((b) => {
                  const name = `${b.member.user.profile?.firstName ?? ''} ${b.member.user.profile?.lastName ?? ''}`;
                  const holds = ['CONFIRMED', 'ATTENDED', 'NO_SHOW'].includes(b.status);
                  return (
                    <tr key={b.id}>
                      <Td>
                        <Link
                          href={can('members.read') ? `/admin/members/${b.member.id}` : '#'}
                          className="flex items-center gap-3"
                        >
                          <Avatar src={b.member.user.profile?.avatarUrl} name={name} className="size-8" />
                          <span>
                            <span className="block font-medium">{name}</span>
                            <span className="text-xs text-muted">
                              {b.member.user.profile?.phone ?? b.member.user.email}
                            </span>
                          </span>
                        </Link>
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            b.status === 'ATTENDED'
                              ? 'success'
                              : b.status === 'NO_SHOW'
                                ? 'danger'
                                : b.status === 'CONFIRMED'
                                  ? 'info'
                                  : 'neutral'
                          }
                        >
                          {enums(b.status)}
                        </Badge>
                        {b.fromWaitlist && <span className="ml-2 text-xs text-muted">{t('fromWaitlist')}</span>}
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          {canMark && holds && (
                            <>
                              <Button
                                size="sm"
                                variant={b.status === 'ATTENDED' ? 'primary' : 'outline'}
                                onClick={() => mark.mutate({ bookingId: b.id, status: 'ATTENDED' })}
                                aria-label={t('present')}
                              >
                                <Check /> {t('present')}
                              </Button>
                              <Button
                                size="sm"
                                variant={b.status === 'NO_SHOW' ? 'danger' : 'outline'}
                                onClick={() => mark.mutate({ bookingId: b.id, status: 'NO_SHOW' })}
                                aria-label={t('absent')}
                              >
                                <X /> {t('absent')}
                              </Button>
                            </>
                          )}
                          {can('bookings.manage') &&
                            b.status === 'CONFIRMED' &&
                            s.status === 'SCHEDULED' &&
                            !started && (
                              <Button size="sm" variant="ghost" onClick={() => cancelBooking.mutate(b.id)}>
                                {t('cancelBooking')}
                              </Button>
                            )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            {t('summary', {
              active: active.length,
              attended: data.bookings.filter((b) => b.status === 'ATTENDED').length,
            })}
          </p>
        </Card>
        <Card className="h-fit">
          <CardHeader title={t('waitlist')} />
          {!data.waitlist.length ? (
            <EmptyState title={t('noWaitlist')} />
          ) : (
            <ol className="divide-y divide-border text-sm">
              {data.waitlist.map((w, i) => (
                <li key={w.id} className="flex justify-between px-5 py-3">
                  <span>
                    {i + 1}. {w.member.user.profile?.firstName} {w.member.user.profile?.lastName}
                  </span>
                  <span className="text-muted">{fmt.relative(w.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('cancelTitle')}
        description={t('cancelLead', { count: active.length })}
        confirmLabel={t('cancelSession')}
        danger
        requireReason
        loading={cancelSession.isPending}
        onConfirm={(r) => cancelSession.mutate(r)}
      />
      {addOpen && <AddMemberDialog sessionId={id} onClose={() => setAddOpen(false)} />}
      {editOpen && <EditSessionDialog session={s} onClose={() => setEditOpen(false)} />}
    </AdminPage>
  );
}

function AddMemberDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const t = useTranslations('admin.session');
  const [q, setQ] = useState('');
  const results = useQuery({
    queryKey: ['member-search', q],
    queryFn: () =>
      api.get<
        Paginated<{
          id: string;
          memberNumber: number;
          user: { email: string; profile: { firstName: string; lastName: string } | null };
        }>
      >(`/admin/members${qs({ q, pageSize: 8 })}`),
    enabled: q.trim().length >= 2,
  });
  const book = useAdminMutation((memberId: string) => api.post('/admin/bookings', { sessionId, memberId }), {
    invalidate: [['admin-session', sessionId]],
    success: t('memberBooked'),
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader title={t('addMember')} description={t('addMemberLead')} />
        <DialogBody className="space-y-3">
          <SearchInput value={q} onChange={setQ} placeholder={t('searchMember')} />
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(results.data?.items ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  {m.user.profile?.firstName} {m.user.profile?.lastName}{' '}
                  <span className="text-muted">· FC-{String(m.memberNumber).padStart(6, '0')}</span>
                </span>
                <Button size="sm" onClick={() => book.mutate(m.id)} loading={book.isPending && book.variables === m.id}>
                  {t('book')}
                </Button>
              </li>
            ))}
            {q.trim().length >= 2 && results.data?.items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted">{t('noMatches')}</li>
            )}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function EditSessionDialog({ session, onClose }: { session: SessionItem; onClose: () => void }) {
  const t = useTranslations('admin.session');
  const fmt = useFmt();
  const trainers = useTrainers();
  const branches = useBranches();
  const rooms = (branches.data ?? []).find((b) => b.id === session.branch.id)?.rooms ?? [];
  const [form, setForm] = useState({
    trainerId: session.trainer.id,
    roomId: session.room.id,
    capacity: session.capacity,
  });
  const save = useAdminMutation(() => api.patch(`/admin/sessions/${session.id}`, form), {
    invalidate: [['admin-session', session.id], ['admin-sessions']],
    success: t('saved'),
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader title={t('edit')} description={t('editLead')} />
        <DialogBody className="space-y-4">
          <Field label={t('trainer')}>
            {(p) => (
              <Select {...p} value={form.trainerId} onChange={(e) => setForm({ ...form, trainerId: e.target.value })}>
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
          <Field label={t('room')}>
            {(p) => (
              <Select {...p} value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                {rooms
                  .filter((r) => r.isActive)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {fmt.t(r.name)} ({r.capacity})
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t('capacity')} hint={t('capacityHint', { booked: session.bookedCount })}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={Math.max(1, session.bookedCount)}
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
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
