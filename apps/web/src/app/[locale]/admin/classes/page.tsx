'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Archive, ArchiveRestore, LayoutGrid, Pencil, Plus } from 'lucide-react';
import { DIFFICULTIES, type Difficulty, type LocalizedText } from '@fitclub/shared';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/controls';
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { AdminPage, emptyText, issuesToMap, LocalizedField, useAdminMutation } from '@/components/admin/kit';
import { MediaPicker } from '@/components/admin/media-picker';

interface Category {
  id: string;
  slug: string;
  name: LocalizedText;
  sortOrder: number;
  _count: { classTypes: number };
}
interface ClassType {
  id: string;
  slug: string;
  categoryId: string;
  name: LocalizedText;
  summary: LocalizedText;
  description: LocalizedText;
  difficulty: Difficulty;
  durationMinutes: number;
  defaultCapacity: number;
  intensity: number;
  imageUrl: string | null;
  isPublic: boolean;
  isArchived: boolean;
  category: { name: LocalizedText };
}

export default function ClassesAdmin() {
  const t = useTranslations('admin.classes');
  const classesT = useTranslations('classes');
  const fmt = useFmt();
  const categories = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<Category[]>('/classes/categories'),
  });
  const types = useQuery({
    queryKey: ['admin-class-types'],
    queryFn: () => api.get<ClassType[]>('/admin/class-types'),
  });
  const [editingType, setEditingType] = useState<ClassType | 'new' | null>(null);
  const [editingCat, setEditingCat] = useState<Category | 'new' | null>(null);
  const archive = useAdminMutation(
    ({ id, archived }: { id: string; archived: boolean }) => api.post(`/admin/class-types/${id}/archive`, { archived }),
    { invalidate: [['admin-class-types']], revalidateSite: true },
  );

  return (
    <AdminPage
      title={t('title')}
      description={t('lead')}
      actions={
        <>
          <Button variant="outline" onClick={() => setEditingCat('new')}>
            <Plus /> {t('addCategory')}
          </Button>
          <Button onClick={() => setEditingType('new')}>
            <Plus /> {t('addClass')}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div>
          {types.isLoading ? (
            <Skeleton className="h-80" />
          ) : !types.data?.length ? (
            <Card>
              <EmptyState icon={<LayoutGrid />} title={t('empty')} />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {types.data.map((c) => (
                <Card key={c.id} className={c.isArchived ? 'opacity-55' : undefined}>
                  <div className="relative aspect-[16/9] overflow-hidden rounded-t-xl bg-surface-2">
                    {c.imageUrl && <Image src={c.imageUrl} alt="" fill sizes="400px" className="object-cover" />}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{fmt.t(c.name)}</p>
                        <p className="text-xs text-muted">
                          {fmt.t(c.category.name)} · {classesT(`difficulty.${c.difficulty}`)} ·{' '}
                          {classesT('minutes', { count: c.durationMinutes })} ·{' '}
                          {t('capacityShort', { count: c.defaultCapacity })}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditingType(c)} aria-label={t('edit')}>
                          <Pencil />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => archive.mutate({ id: c.id, archived: !c.isArchived })}
                          aria-label={c.isArchived ? t('restore') : t('archive')}
                        >
                          {c.isArchived ? <ArchiveRestore /> : <Archive />}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      {!c.isPublic && <Badge>{t('hidden')}</Badge>}
                      {c.isArchived && <Badge>{t('archived')}</Badge>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        <Card className="h-fit">
          <CardHeader title={t('categories')} />
          <ul className="divide-y divide-border">
            {(categories.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  {fmt.t(c.name)} <span className="text-muted">({c._count.classTypes})</span>
                </span>
                <Button size="icon" variant="ghost" onClick={() => setEditingCat(c)} aria-label={t('edit')}>
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {editingType && (
        <ClassTypeDialog
          item={editingType === 'new' ? null : editingType}
          categories={categories.data ?? []}
          onClose={() => setEditingType(null)}
        />
      )}
      {editingCat && (
        <CategoryDialog item={editingCat === 'new' ? null : editingCat} onClose={() => setEditingCat(null)} />
      )}
    </AdminPage>
  );
}

function ClassTypeDialog({
  item,
  categories,
  onClose,
}: {
  item: ClassType | null;
  categories: Category[];
  onClose: () => void;
}) {
  const t = useTranslations('admin.classes');
  const classesT = useTranslations('classes');
  const fmt = useFmt();
  const [form, setForm] = useState({
    slug: item?.slug ?? '',
    categoryId: item?.categoryId ?? categories[0]?.id ?? '',
    name: item?.name ?? emptyText(),
    summary: item?.summary ?? emptyText(),
    description: item?.description ?? emptyText(),
    difficulty: item?.difficulty ?? ('ALL_LEVELS' as Difficulty),
    durationMinutes: item?.durationMinutes ?? 55,
    defaultCapacity: item?.defaultCapacity ?? 16,
    intensity: item?.intensity ?? 3,
    imageUrl: item?.imageUrl ?? null,
    isPublic: item?.isPublic ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminMutation(
    () => (item ? api.put(`/admin/class-types/${item.id}`, form) : api.post('/admin/class-types', form)),
    {
      invalidate: [['admin-class-types']],
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
        <DialogHeader title={item ? t('editClass') : t('addClass')} />
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
              label={t('summary')}
              value={form.summary}
              onChange={(summary) => setForm({ ...form, summary })}
              multiline
              rows={2}
            />
            <LocalizedField
              label={t('description')}
              value={form.description}
              onChange={(description) => setForm({ ...form, description })}
              multiline
              rows={4}
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
              <Field label={t('category')}>
                {(p) => (
                  <Select
                    {...p}
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {fmt.t(c.name)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('difficulty')}>
                {(p) => (
                  <Select
                    {...p}
                    value={form.difficulty}
                    onChange={(e) => setForm({ ...form, difficulty: e.target.value as Difficulty })}
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {classesT(`difficulty.${d}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('intensity')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    max={5}
                    value={form.intensity}
                    onChange={(e) => setForm({ ...form, intensity: Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label={t('duration')} error={errors.durationMinutes}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={15}
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label={t('capacity')} error={errors.defaultCapacity}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    value={form.defaultCapacity}
                    onChange={(e) => setForm({ ...form, defaultCapacity: Number(e.target.value) })}
                  />
                )}
              </Field>
            </div>
            <MediaPicker
              label={t('image')}
              value={form.imageUrl}
              onChange={(imageUrl) => setForm({ ...form, imageUrl })}
            />
            <label className="flex items-center justify-between text-sm">
              {t('isPublic')}{' '}
              <Switch checked={form.isPublic} onCheckedChange={(v) => setForm({ ...form, isPublic: v })} />
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

function CategoryDialog({ item, onClose }: { item: Category | null; onClose: () => void }) {
  const t = useTranslations('admin.classes');
  const [form, setForm] = useState({
    slug: item?.slug ?? '',
    name: item?.name ?? emptyText(),
    sortOrder: item?.sortOrder ?? 100,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminMutation(
    () => (item ? api.put(`/admin/class-categories/${item.id}`, form) : api.post('/admin/class-categories', form)),
    {
      invalidate: [['admin-categories']],
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
      <DialogContent size="sm">
        <DialogHeader title={item ? t('editCategory') : t('addCategory')} />
        <DialogBody className="space-y-4">
          <LocalizedField
            label={t('name')}
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            error={errors.name}
            required
          />
          <Field label={t('slug')} error={errors.slug}>
            {(p) => (
              <Input
                {...p}
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
              />
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
