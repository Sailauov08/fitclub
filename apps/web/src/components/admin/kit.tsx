'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import { LOCALES, type Locale, type LocalizedText } from '@fitclub/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { useErrorMessage } from '@/components/providers';
import { cn } from '@/lib/utils';

export function AdminPage({
  title,
  description,
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setLocal(value);
  }
  useEffect(() => {
    const id = setTimeout(() => local !== value && onChange(local), 300);
    return () => clearTimeout(id);
  }, [local, value, onChange]);
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const t = useTranslations('common');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="px-5 py-3 text-xs text-muted">{t('results', { count: total })}</p>;
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-3 text-sm">
      <span className="text-muted">
        {t('results', { count: total })} · {t('page', { page, pages })}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label={t('previous')}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label={t('next')}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** Mutation with success toast, translated error toast, cache invalidation and optional public-site refresh. */
export function useAdminMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: {
    invalidate?: QueryKey[];
    success?: string;
    revalidateSite?: boolean;
    onSuccess?: (r: TResult, v: TVars) => void;
    onError?: (e: unknown) => boolean | void;
  } = {},
) {
  const qc = useQueryClient();
  const message = useErrorMessage();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      if (opts.success) toast.success(opts.success);
      await Promise.all((opts.invalidate ?? []).map((key) => qc.invalidateQueries({ queryKey: key })));
      if (opts.revalidateSite) await fetch('/cms-revalidate', { method: 'POST' }).catch(() => undefined);
      opts.onSuccess?.(result, vars);
    },
    onError: (error) => {
      if (opts.onError?.(error)) return;
      toast.error(message(error));
    },
  });
}

/** Confirmation with an optional mandatory reason (audited actions). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  requireReason,
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  requireReason?: boolean;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations('admin.common');
  const [reason, setReason] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setReason('');
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader title={title} description={description} />
        <DialogBody className="space-y-4">
          {children}
          {requireReason && (
            <Field label={t('reason')} hint={t('reasonHint')}>
              {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            disabled={requireReason && reason.trim().length < 3}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LANG: Record<Locale, string> = { kk: 'KK', ru: 'RU', en: 'EN' };

/** One text value per language with a compact language switcher. */
export function LocalizedField({
  label,
  value,
  onChange,
  multiline,
  rows = 3,
  error,
  required,
}: {
  label: string;
  value: LocalizedText;
  onChange: (v: LocalizedText) => void;
  multiline?: boolean;
  rows?: number;
  error?: string;
  required?: boolean;
}) {
  const [lang, setLang] = useState<Locale>('ru');
  const missing = LOCALES.filter((l) => !value?.[l]?.trim());
  return (
    <Field label={label} error={error} required={required}>
      {(p) => (
        <div>
          <div className="mb-1.5 flex gap-1">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={cn(
                  'rounded px-2 py-0.5 text-[0.7rem] font-semibold',
                  lang === l ? 'bg-foreground text-background' : 'bg-surface-2 text-muted',
                  missing.includes(l) && lang !== l && 'text-warning',
                )}
                aria-pressed={lang === l}
              >
                {LANG[l]}
                {missing.includes(l) && ' •'}
              </button>
            ))}
          </div>
          {multiline ? (
            <Textarea
              {...p}
              rows={rows}
              lang={lang}
              value={value?.[lang] ?? ''}
              onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
            />
          ) : (
            <Input
              {...p}
              lang={lang}
              value={value?.[lang] ?? ''}
              onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
            />
          )}
        </div>
      )}
    </Field>
  );
}

export const emptyText = (): LocalizedText => ({ kk: '', ru: '', en: '' });

/** Maps API field issues (paths like "name.ru") to a flat message lookup for hand-built forms. */
export function issuesToMap(error: unknown): Record<string, string> {
  const details = (error as { details?: { issues?: { path: string; message: string }[] } })?.details;
  const out: Record<string, string> = {};
  for (const i of details?.issues ?? []) {
    const root = i.path.split('.')[0] ?? i.path;
    out[i.path] = i.message;
    out[root] ??= i.message;
  }
  return out;
}
