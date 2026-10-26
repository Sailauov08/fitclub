'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Building2, DoorOpen, Pencil, Plus } from 'lucide-react';
import type { LocalizedText } from '@fitclub/shared';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox, Switch } from '@/components/ui/controls';
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { AdminPage, emptyText, issuesToMap, LocalizedField, useAdminMutation } from '@/components/admin/kit';
import { MediaPicker } from '@/components/admin/media-picker';

interface Room {
  id: string;
  branchId: string;
  name: LocalizedText;
  capacity: number;
  equipment: LocalizedText;
  isActive: boolean;
}
interface BranchRow {
  id: string;
  slug: string;
  name: LocalizedText;
  city: LocalizedText;
  address: LocalizedText;
  description: LocalizedText;
  phone: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
  openingHours: { open: string; close: string; closed: boolean }[];
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  rooms: Room[];
  _count: { members: number; staff: number };
}

export default function BranchesAdmin() {
  const t = useTranslations('admin.branches');
  const fmt = useFmt();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-branches'],
    queryFn: () => api.get<BranchRow[]>('/admin/branches'),
  });
  const [editing, setEditing] = useState<BranchRow | 'new' | null>(null);
  const [room, setRoom] = useState<{ branchId: string; room: Room | null } | null>(null);
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
      {isLoading ? (
        <Skeleton className="h-80" />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<Building2 />} title={t('empty')} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {data.map((b) => (
            <Card key={b.id} className={!b.isActive ? 'opacity-60' : undefined}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {fmt.t(b.name)} {!b.isActive && <Badge>{t('inactive')}</Badge>}
                  </span>
                }
                description={`${fmt.t(b.city)}, ${fmt.t(b.address)} · ${t('stats', { members: b._count.members, staff: b._count.staff })}`}
                action={
                  <Button size="sm" variant="ghost" onClick={() => setEditing(b)} aria-label={t('edit')}>
                    <Pencil />
                  </Button>
                }
              />
              <ul className="divide-y divide-border">
                {b.rooms.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <DoorOpen className="size-4 text-muted" /> {fmt.t(r.name)}
                      {!r.isActive && <Badge>{t('inactive')}</Badge>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-muted">{t('capacity', { count: r.capacity })}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRoom({ branchId: b.id, room: r })}
                        aria-label={t('editRoom')}
                      >
                        <Pencil />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border p-3">
                <Button size="sm" variant="outline" onClick={() => setRoom({ branchId: b.id, room: null })}>
                  <Plus /> {t('addRoom')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <BranchDialog branch={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {room && <RoomDialog branchId={room.branchId} room={room.room} onClose={() => setRoom(null)} />}
    </AdminPage>
  );
}

const DEFAULT_HOURS = Array.from({ length: 7 }, (_, i) => ({
  open: i < 5 ? '06:30' : '08:00',
  close: i < 5 ? '23:00' : '22:00',
  closed: false,
}));

function BranchDialog({ branch, onClose }: { branch: BranchRow | null; onClose: () => void }) {
  const t = useTranslations('admin.branches');
  const days = useTranslations('weekdays');
  const [form, setForm] = useState({
    slug: branch?.slug ?? '',
    name: branch?.name ?? emptyText(),
    city: branch?.city ?? emptyText(),
    address: branch?.address ?? emptyText(),
    description: branch?.description ?? emptyText(),
    phone: branch?.phone ?? '',
    email: branch?.email ?? '',
    latitude: branch?.latitude ?? null,
    longitude: branch?.longitude ?? null,
    openingHours: branch?.openingHours ?? DEFAULT_HOURS,
    imageUrl: branch?.imageUrl ?? null,
    isActive: branch?.isActive ?? true,
    sortOrder: branch?.sortOrder ?? 100,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminMutation(
    () => (branch ? api.put(`/admin/branches/${branch.id}`, form) : api.post('/admin/branches', form)),
    {
      invalidate: [['admin-branches']],
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
  const setHours = (i: number, patch: Partial<(typeof form.openingHours)[number]>) =>
    setForm({ ...form, openingHours: form.openingHours.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader title={branch ? t('edit') : t('add')} />
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
              label={t('city')}
              value={form.city}
              onChange={(city) => setForm({ ...form, city })}
              error={errors.city}
              required
            />
            <LocalizedField
              label={t('address')}
              value={form.address}
              onChange={(address) => setForm({ ...form, address })}
              error={errors.address}
              required
            />
            <LocalizedField
              label={t('description')}
              value={form.description}
              onChange={(description) => setForm({ ...form, description })}
              multiline
              rows={2}
            />
            <MediaPicker
              label={t('image')}
              value={form.imageUrl}
              onChange={(imageUrl) => setForm({ ...form, imageUrl })}
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
              <Field label={t('phone')}>
                {(p) => (
                  <Input {...p} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                )}
              </Field>
              <Field label="E-mail">
                {(p) => (
                  <Input {...p} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                )}
              </Field>
              <Field label={t('sortOrder')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label={t('lat')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    step="0.0001"
                    value={form.latitude ?? ''}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value ? Number(e.target.value) : null })}
                  />
                )}
              </Field>
              <Field label={t('lng')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    step="0.0001"
                    value={form.longitude ?? ''}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value ? Number(e.target.value) : null })}
                  />
                )}
              </Field>
            </div>
            <div>
              <p className="mb-2 text-[0.8rem] font-medium">{t('hours')}</p>
              <div className="space-y-1.5">
                {form.openingHours.map((h, i) => (
                  <div key={i} className="grid grid-cols-[48px_1fr_1fr_auto] items-center gap-2 text-sm">
                    <span className="text-muted">{days(String(i))}</span>
                    <Input
                      type="time"
                      value={h.open}
                      disabled={h.closed}
                      onChange={(e) => setHours(i, { open: e.target.value })}
                      className="h-8"
                      aria-label={`${days(String(i))} ${t('open')}`}
                    />
                    <Input
                      type="time"
                      value={h.close}
                      disabled={h.closed}
                      onChange={(e) => setHours(i, { close: e.target.value })}
                      className="h-8"
                      aria-label={`${days(String(i))} ${t('close')}`}
                    />
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={h.closed} onCheckedChange={(v) => setHours(i, { closed: v === true })} />{' '}
                      {t('closed')}
                    </label>
                  </div>
                ))}
              </div>
              {errors.openingHours && <p className="mt-1 text-xs text-danger">{t('hoursError')}</p>}
            </div>
            <label className="flex items-center justify-between text-sm">
              {t('active')}{' '}
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </label>
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

function RoomDialog({ branchId, room, onClose }: { branchId: string; room: Room | null; onClose: () => void }) {
  const t = useTranslations('admin.branches');
  const [form, setForm] = useState({
    branchId,
    name: room?.name ?? emptyText(),
    capacity: room?.capacity ?? 20,
    equipment: room?.equipment ?? emptyText(),
    isActive: room?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminMutation(
    () => (room ? api.put(`/admin/rooms/${room.id}`, form) : api.post('/admin/rooms', form)),
    {
      invalidate: [['admin-branches']],
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
      <DialogContent size="sm">
        <DialogHeader title={room ? t('editRoom') : t('addRoom')} />
        <DialogBody className="space-y-4">
          <LocalizedField
            label={t('name')}
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            error={errors.name}
            required
          />
          <Field label={t('roomCapacity')} error={errors.capacity}>
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
          <LocalizedField
            label={t('equipment')}
            value={form.equipment}
            onChange={(equipment) => setForm({ ...form, equipment })}
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
