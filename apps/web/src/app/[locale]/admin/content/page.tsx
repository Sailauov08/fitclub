'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { CONTENT_BLOCKS, type ContentBlock, type ImageRef, type LocalizedText } from '@fitclub/shared';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Checkbox, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import {
  AdminPage,
  ConfirmDialog,
  emptyText,
  issuesToMap,
  LocalizedField,
  useAdminMutation,
} from '@/components/admin/kit';
import { MediaPicker } from '@/components/admin/media-picker';

export default function ContentAdmin() {
  const t = useTranslations('admin.content');
  return (
    <AdminPage title={t('title')} description={t('lead')}>
      <Tabs defaultValue="blocks">
        <TabsList>
          <TabsTrigger value="blocks">{t('tabs.blocks')}</TabsTrigger>
          <TabsTrigger value="blog">{t('tabs.blog')}</TabsTrigger>
          <TabsTrigger value="faq">{t('tabs.faq')}</TabsTrigger>
          <TabsTrigger value="gallery">{t('tabs.gallery')}</TabsTrigger>
          <TabsTrigger value="testimonials">{t('tabs.testimonials')}</TabsTrigger>
          <TabsTrigger value="facilities">{t('tabs.facilities')}</TabsTrigger>
          <TabsTrigger value="announcements">{t('tabs.announcements')}</TabsTrigger>
        </TabsList>
        <TabsContent value="blocks">
          <Blocks />
        </TabsContent>
        <TabsContent value="blog">
          <Blog />
        </TabsContent>
        {(['faq', 'gallery', 'testimonials', 'facilities', 'announcements'] as const).map((name) => (
          <TabsContent key={name} value={name}>
            <Collection name={name} />
          </TabsContent>
        ))}
      </Tabs>
    </AdminPage>
  );
}

// ───────────── Page blocks ─────────────

function Blocks() {
  const t = useTranslations('admin.content');
  const { data, isLoading } = useQuery({
    queryKey: ['content-blocks'],
    queryFn: () =>
      api.get<{ key: string; data: ContentBlock | null; version: number; updatedAt: string | null }[]>(
        '/admin/content/blocks',
      ),
  });
  const [key, setKey] = useState(CONTENT_BLOCKS[0]!.key);
  const entry = data?.find((d) => d.key === key);
  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <Card className="h-fit p-2">
        {CONTENT_BLOCKS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setKey(b.key)}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm ${key === b.key ? 'bg-foreground text-background' : 'hover:bg-surface-2'}`}
          >
            {t(`blocks.${b.key.replace('.', '_')}`)}
          </button>
        ))}
      </Card>
      {isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <BlockEditor key={`${key}-${entry?.version ?? 0}`} blockKey={key} entry={entry ?? null} />
      )}
    </div>
  );
}

function BlockEditor({
  blockKey,
  entry,
}: {
  blockKey: string;
  entry: { data: ContentBlock | null; version: number; updatedAt: string | null } | null;
}) {
  const t = useTranslations('admin.content');
  const fmt = useFmt();
  const descriptor = CONTENT_BLOCKS.find((b) => b.key === blockKey)!;
  const [block, setBlock] = useState<ContentBlock>(() => ({
    fields: Object.fromEntries(descriptor.fields.map((f) => [f.name, entry?.data?.fields?.[f.name] ?? emptyText()])),
    images: entry?.data?.images ?? {},
    items: entry?.data?.items ?? [],
  }));
  const save = useAdminMutation(
    () => api.put(`/admin/content/blocks/${blockKey}`, { ...block, version: entry?.version ?? 0 }),
    { invalidate: [['content-blocks']], revalidateSite: true, success: t('published') },
  );
  const setImage = (name: string, patch: Partial<ImageRef> | null) =>
    setBlock((b) => {
      const images = { ...b.images };
      if (patch === null) delete images[name];
      else images[name] = { url: '', alt: emptyText(), isDemo: false, ...images[name], ...patch } as ImageRef;
      return { ...b, images };
    });

  return (
    <Card>
      <CardHeader
        title={t(`blocks.${blockKey.replace('.', '_')}`)}
        description={
          entry?.updatedAt
            ? t('lastSaved', { when: fmt.relative(entry.updatedAt), version: entry.version })
            : t('notSaved')
        }
        action={
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            {t('publish')}
          </Button>
        }
      />
      <div className="space-y-5 p-5">
        {descriptor.fields.map((f) => (
          <LocalizedField
            key={f.name}
            label={t(`fields.${f.name}`)}
            value={block.fields[f.name] ?? emptyText()}
            multiline={f.kind !== 'text'}
            rows={f.kind === 'markdown' ? 10 : 3}
            onChange={(v) => setBlock({ ...block, fields: { ...block.fields, [f.name]: v } })}
          />
        ))}
        {descriptor.fields.some((f) => f.kind === 'markdown') && (
          <p className="text-xs text-muted">{t('markdownHint')}</p>
        )}
        {descriptor.images.map((name) => (
          <div key={name} className="rounded-lg border border-border p-4">
            <MediaPicker
              label={t(`fields.${name}`)}
              value={block.images[name]?.url || null}
              onChange={(url) => (url ? setImage(name, { url }) : setImage(name, null))}
            />
            {block.images[name] && (
              <div className="mt-3 space-y-3">
                <LocalizedField
                  label={t('altText')}
                  value={block.images[name]!.alt}
                  onChange={(alt) => setImage(name, { alt })}
                />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={block.images[name]!.isDemo}
                    onCheckedChange={(v) => setImage(name, { isDemo: v === true })}
                  />{' '}
                  {t('isDemo')}
                </label>
              </div>
            )}
          </div>
        ))}
        {descriptor.items && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">{t('items')}</p>
            {block.items.map((item, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-muted">#{i + 1}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setBlock({ ...block, items: block.items.filter((_, j) => j !== i) })}
                    aria-label={t('remove')}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <LocalizedField
                  label={t('fields.title')}
                  value={item.title}
                  onChange={(title) =>
                    setBlock({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, title } : x)) })
                  }
                />
                <LocalizedField
                  label={t('fields.body')}
                  value={item.body}
                  multiline
                  rows={2}
                  onChange={(body) =>
                    setBlock({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, body } : x)) })
                  }
                />
                <Field label={t('icon')} hint={t('iconHint')}>
                  {(p) => (
                    <Input
                      {...p}
                      value={item.icon ?? ''}
                      onChange={(e) =>
                        setBlock({
                          ...block,
                          items: block.items.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)),
                        })
                      }
                    />
                  )}
                </Field>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBlock({ ...block, items: [...block.items, { title: emptyText(), body: emptyText() }] })}
            >
              <Plus /> {t('addItem')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ───────────── Blog ─────────────

interface Post {
  id: string;
  slug: string;
  title: LocalizedText;
  excerpt: LocalizedText;
  body: LocalizedText;
  coverImage: ImageRef | null;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: string | null;
  updatedAt: string;
}

function Blog() {
  const t = useTranslations('admin.content');
  const fmt = useFmt();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-blog'],
    queryFn: () => api.get<Post[]>('/admin/content/blog'),
  });
  const [editing, setEditing] = useState<Post | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const remove = useAdminMutation((id: string) => api.delete(`/admin/content/blog/${id}`), {
    invalidate: [['admin-blog']],
    revalidateSite: true,
    onSuccess: () => setDeleting(null),
  });
  return (
    <Card>
      <CardHeader
        title={t('tabs.blog')}
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> {t('newPost')}
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="m-4 h-40" />
      ) : !data?.length ? (
        <EmptyState icon={<FileText />} title={t('noPosts')} />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{fmt.t(p.title)}</p>
                <p className="text-xs text-muted">
                  /{p.slug} · {p.publishedAt ? fmt.date(p.publishedAt) : t('draft')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Badge tone={p.status === 'PUBLISHED' ? 'success' : 'neutral'}>{t(`postStatus.${p.status}`)}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={t('edit')}>
                  <Pencil />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(p)} aria-label={t('delete')}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <PostDialog post={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('deleteTitle')}
        description={deleting ? fmt.t(deleting.title) : undefined}
        confirmLabel={t('delete')}
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Card>
  );
}

function PostDialog({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const t = useTranslations('admin.content');
  const [form, setForm] = useState({
    slug: post?.slug ?? '',
    title: post?.title ?? emptyText(),
    excerpt: post?.excerpt ?? emptyText(),
    body: post?.body ?? emptyText(),
    coverImage: post?.coverImage ?? null,
    tags: post?.tags.join(', ') ?? '',
    status: post?.status ?? ('DRAFT' as Post['status']),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const body = () => ({
    ...form,
    tags: form.tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  });
  const save = useAdminMutation(
    () => (post ? api.put(`/admin/content/blog/${post.id}`, body()) : api.post('/admin/content/blog', body())),
    {
      invalidate: [['admin-blog']],
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
        <DialogHeader title={post ? t('editPost') : t('newPost')} />
        <DialogBody className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <LocalizedField
              label={t('fields.title')}
              value={form.title}
              onChange={(title) => setForm({ ...form, title })}
              error={errors.title}
              required
            />
            <LocalizedField
              label={t('excerpt')}
              value={form.excerpt}
              onChange={(excerpt) => setForm({ ...form, excerpt })}
              multiline
              rows={2}
            />
            <LocalizedField
              label={t('fields.body')}
              value={form.body}
              onChange={(b) => setForm({ ...form, body: b })}
              multiline
              rows={14}
            />
            <p className="text-xs text-muted">{t('markdownHint')}</p>
          </div>
          <div className="space-y-4">
            <Field label={t('slug')} error={errors.slug}>
              {(p) => (
                <Input
                  {...p}
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                />
              )}
            </Field>
            <Field label={t('status')}>
              {(p) => (
                <Select
                  {...p}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Post['status'] })}
                >
                  <option value="DRAFT">{t('postStatus.DRAFT')}</option>
                  <option value="PUBLISHED">{t('postStatus.PUBLISHED')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('tags')} hint={t('commaSeparated')}>
              {(p) => <Input {...p} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />}
            </Field>
            <MediaPicker
              label={t('cover')}
              value={form.coverImage?.url ?? null}
              onChange={(url) =>
                setForm({
                  ...form,
                  coverImage: url
                    ? { url, alt: form.coverImage?.alt ?? emptyText(), isDemo: form.coverImage?.isDemo ?? false }
                    : null,
                })
              }
            />
            {form.coverImage && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.coverImage.isDemo}
                  onCheckedChange={(v) => setForm({ ...form, coverImage: { ...form.coverImage!, isDemo: v === true } })}
                />{' '}
                {t('isDemo')}
              </label>
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

// ───────────── Simple collections ─────────────

type CollectionName = 'faq' | 'gallery' | 'testimonials' | 'facilities' | 'announcements';
type Item = Record<string, unknown> & { id: string };

const TEMPLATES: Record<CollectionName, () => Record<string, unknown>> = {
  faq: () => ({ question: emptyText(), answer: emptyText(), category: 'club', sortOrder: 100, isPublished: true }),
  gallery: () => ({
    image: { url: '', alt: emptyText(), isDemo: false },
    caption: emptyText(),
    category: 'gym',
    branchId: null,
    sortOrder: 100,
    isPublished: true,
  }),
  testimonials: () => ({
    authorName: '',
    authorDetail: emptyText(),
    quote: emptyText(),
    rating: 5,
    isPublished: true,
    sortOrder: 100,
  }),
  facilities: () => ({
    slug: '',
    name: emptyText(),
    description: emptyText(),
    icon: 'dumbbell',
    image: null,
    branchIds: [],
    sortOrder: 100,
    isPublished: true,
  }),
  announcements: () => ({ message: emptyText(), linkUrl: null, startsAt: null, endsAt: null, isActive: true }),
};

function titleOf(name: CollectionName, item: Item, pick: (v: LocalizedText) => string) {
  const v = (
    name === 'faq'
      ? item.question
      : name === 'gallery'
        ? item.caption
        : name === 'testimonials'
          ? item.quote
          : name === 'facilities'
            ? item.name
            : item.message
  ) as LocalizedText;
  return pick(v) || (item.authorName as string) || '—';
}

function Collection({ name }: { name: CollectionName }) {
  const t = useTranslations('admin.content');
  const fmt = useFmt();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-collection', name],
    queryFn: () => api.get<Item[]>(`/admin/content/collections/${name}`),
  });
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const remove = useAdminMutation((id: string) => api.delete(`/admin/content/collections/${name}/${id}`), {
    invalidate: [['admin-collection', name]],
    revalidateSite: true,
  });
  return (
    <Card>
      <CardHeader
        title={t(`tabs.${name}`)}
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> {t('add')}
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="m-4 h-40" />
      ) : !data?.length ? (
        <EmptyState title={t('noItems')} />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((item) => {
            const published = (item.isPublished ?? item.isActive) as boolean;
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <p className="min-w-0 truncate text-sm">{titleOf(name, item, fmt.t)}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge tone={published ? 'success' : 'neutral'}>{published ? t('visible') : t('hiddenItem')}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(item)} aria-label={t('edit')}>
                    <Pencil />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(item.id)} aria-label={t('delete')}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <CollectionDialog name={name} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </Card>
  );
}

function CollectionDialog({ name, item, onClose }: { name: CollectionName; item: Item | null; onClose: () => void }) {
  const t = useTranslations('admin.content');
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const base = TEMPLATES[name]();
    if (!item) return base;
    const merged: Record<string, unknown> = { ...base };
    for (const k of Object.keys(base)) if (item[k] !== undefined) merged[k] = item[k];
    if (name === 'announcements') {
      merged.startsAt = item.startsAt ? String(item.startsAt).slice(0, 16) : null;
      merged.endsAt = item.endsAt ? String(item.endsAt).slice(0, 16) : null;
    }
    return merged;
  });
  // Server field errors belong to the form state they were reported for; any edit clears them.
  const [reported, setReported] = useState<{ form: typeof form; errors: Record<string, string> } | null>(null);
  const errors = reported?.form === form ? reported.errors : {};
  const payload = () =>
    name === 'announcements'
      ? {
          ...form,
          startsAt: form.startsAt ? new Date(String(form.startsAt)).toISOString() : null,
          endsAt: form.endsAt ? new Date(String(form.endsAt)).toISOString() : null,
          linkUrl: form.linkUrl || null,
        }
      : form;
  const save = useAdminMutation(
    () =>
      item
        ? api.put(`/admin/content/collections/${name}/${item.id}`, payload())
        : api.post(`/admin/content/collections/${name}`, payload()),
    {
      invalidate: [['admin-collection', name]],
      revalidateSite: true,
      success: t('saved'),
      onSuccess: onClose,
      onError: (e) => {
        const map = issuesToMap(e);
        setReported({ form, errors: map });
        return Object.keys(map).length > 0;
      },
    },
  );
  const L = (key: string, label: string, multiline = false) => (
    <LocalizedField
      key={key}
      label={label}
      value={form[key] as LocalizedText}
      multiline={multiline}
      onChange={(v) => setForm({ ...form, [key]: v })}
      error={errors[key]}
    />
  );
  const image = (form.image ?? null) as ImageRef | null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader title={item ? t('edit') : t('add')} description={t(`tabs.${name}`)} />
        <DialogBody className="space-y-4">
          {name === 'faq' && (
            <>
              {L('question', t('question'))}
              {L('answer', t('answer'), true)}
              <Field label={t('category')}>
                {(p) => (
                  <Select
                    {...p}
                    value={String(form.category)}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {['membership', 'classes', 'payments', 'club'].map((c) => (
                      <option key={c} value={c}>
                        {t(`faqCategories.${c}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </>
          )}
          {name === 'testimonials' && (
            <>
              <Field label={t('author')} error={errors.authorName}>
                {(p) => (
                  <Input
                    {...p}
                    value={String(form.authorName)}
                    onChange={(e) => setForm({ ...form, authorName: e.target.value })}
                  />
                )}
              </Field>
              {L('authorDetail', t('authorDetail'))}
              {L('quote', t('quote'), true)}
              <Field label={t('rating')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    max={5}
                    value={Number(form.rating)}
                    onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                  />
                )}
              </Field>
            </>
          )}
          {name === 'facilities' && (
            <>
              {L('name', t('fields.title'))}
              {L('description', t('fields.body'), true)}
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('slug')} error={errors.slug}>
                  {(p) => (
                    <Input
                      {...p}
                      value={String(form.slug)}
                      onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                    />
                  )}
                </Field>
                <Field label={t('icon')} hint={t('iconHint')}>
                  {(p) => (
                    <Input
                      {...p}
                      value={String(form.icon)}
                      onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    />
                  )}
                </Field>
              </div>
            </>
          )}
          {name === 'gallery' && (
            <>
              {L('caption', t('caption'))}
              <Field label={t('category')}>
                {(p) => (
                  <Select
                    {...p}
                    value={String(form.category)}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {['gym', 'studio', 'pool', 'recovery', 'community'].map((c) => (
                      <option key={c} value={c}>
                        {t(`galleryCategories.${c}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </>
          )}
          {(name === 'gallery' || name === 'facilities') && (
            <div className="rounded-lg border border-border p-4">
              <MediaPicker
                label={t('image')}
                value={image?.url || null}
                onChange={(url) =>
                  setForm({
                    ...form,
                    image: url
                      ? { url, alt: image?.alt ?? emptyText(), isDemo: image?.isDemo ?? false }
                      : name === 'gallery'
                        ? { url: '', alt: emptyText(), isDemo: false }
                        : null,
                  })
                }
              />
              {errors.image && <p className="mt-1 text-xs text-danger">{t('imageRequired')}</p>}
              {image?.url && (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={image.isDemo}
                    onCheckedChange={(v) => setForm({ ...form, image: { ...image, isDemo: v === true } })}
                  />{' '}
                  {t('isDemo')}
                </label>
              )}
            </div>
          )}
          {name === 'announcements' && (
            <>
              {L('message', t('message'))}
              <Field label={t('link')}>
                {(p) => (
                  <Input
                    {...p}
                    value={String(form.linkUrl ?? '')}
                    onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('startsAt')}>
                  {(p) => (
                    <Input
                      {...p}
                      type="datetime-local"
                      value={String(form.startsAt ?? '')}
                      onChange={(e) => setForm({ ...form, startsAt: e.target.value || null })}
                    />
                  )}
                </Field>
                <Field label={t('endsAt')}>
                  {(p) => (
                    <Input
                      {...p}
                      type="datetime-local"
                      value={String(form.endsAt ?? '')}
                      onChange={(e) => setForm({ ...form, endsAt: e.target.value || null })}
                    />
                  )}
                </Field>
              </div>
            </>
          )}
          {name !== 'announcements' && (
            <Field label={t('sortOrder')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  value={Number(form.sortOrder)}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                />
              )}
            </Field>
          )}
          <label className="flex items-center justify-between text-sm">
            {t('visible')}
            <Switch
              checked={Boolean(name === 'announcements' ? form.isActive : form.isPublished)}
              onCheckedChange={(v) => setForm({ ...form, [name === 'announcements' ? 'isActive' : 'isPublished']: v })}
            />
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
