'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImagePlus, Link2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useErrorMessage } from '@/components/providers';

/** Image field: upload to the media library (validated server-side) or paste an https/relative URL. */
export function MediaPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const t = useTranslations('admin.media');
  const message = useErrorMessage();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'preview' | 'url'>('preview');

  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const asset = await api.upload<{ url: string }>('/admin/media', f);
      onChange(asset.url);
      toast.success(t('uploaded'));
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-[0.8rem] font-medium">{label}</p>
      <div className="flex gap-3">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
          {value && (
            <Image
              src={value}
              alt=""
              fill
              sizes="96px"
              className="object-cover"
              unoptimized={value.startsWith('/uploads/')}
            />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => file.current?.click()}>
              <ImagePlus /> {t('upload')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode(mode === 'url' ? 'preview' : 'url')}>
              <Link2 /> {t('url')}
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
                <X /> {t('remove')}
              </Button>
            )}
          </div>
          {mode === 'url' && (
            <Input
              value={value ?? ''}
              placeholder="https://… or /uploads/…"
              onChange={(e) => onChange(e.target.value || null)}
              aria-label={t('url')}
            />
          )}
          <p className="text-xs text-muted">{t('hint')}</p>
        </div>
      </div>
    </div>
  );
}
