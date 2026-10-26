'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ImageRef, LocalizedText } from '@fitclub/shared';
import { useFmt } from '@/lib/format';
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DemoTag } from './brand';

const CATEGORIES = ['all', 'gym', 'studio', 'pool', 'recovery', 'community'] as const;

export function GalleryGrid({
  items,
}: {
  items: { id: string; image: ImageRef; caption: LocalizedText; category: string }[];
}) {
  const t = useTranslations('pages.gallery');
  const common = useTranslations('common');
  const fmt = useFmt();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const [open, setOpen] = useState<number | null>(null);
  const list = items.filter((i) => category === 'all' || i.category === category);
  const current = open === null ? null : list[open];

  return (
    <>
      <div role="tablist" aria-label={t('filter')} className="flex flex-wrap gap-2">
        {CATEGORIES.filter((c) => c === 'all' || items.some((i) => i.category === c)).map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              category === c
                ? 'border-foreground bg-foreground text-background'
                : 'border-border-strong hover:border-foreground',
            )}
          >
            {t(`categories.${c}`)}
          </button>
        ))}
      </div>
      <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3">
        {list.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpen(i)}
            className="group relative mb-4 block w-full overflow-hidden rounded-xl break-inside-avoid"
            aria-label={fmt.t(item.caption)}
          >
            <Image
              src={item.image.url}
              alt={fmt.t(item.image.alt) || fmt.t(item.caption)}
              width={800}
              height={i % 3 === 0 ? 1000 : 600}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="h-auto w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-4 pt-12 text-left text-sm font-medium text-bone opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {fmt.t(item.caption)}
            </span>
            {item.image.isDemo && <DemoTag label={common('demoPhoto')} className="top-2 bottom-auto" />}
          </button>
        ))}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        {current && (
          <DialogContent size="xl" className="bg-ink text-bone">
            <DialogHeader title={fmt.t(current.caption)} />
            <div className="relative aspect-[3/2] w-full">
              <Image
                src={current.image.url}
                alt={fmt.t(current.image.alt) || fmt.t(current.caption)}
                fill
                sizes="90vw"
                className="object-contain"
              />
              {current.image.isDemo && <DemoTag label={common('demoPhoto')} />}
            </div>
            <div className="flex justify-between p-4">
              <button
                type="button"
                className="rounded-md p-2 hover:bg-white/10 disabled:opacity-30"
                onClick={() => setOpen((o) => (o === null ? o : Math.max(0, o - 1)))}
                disabled={open === 0}
                aria-label={common('previous')}
              >
                <ChevronLeft />
              </button>
              <button
                type="button"
                className="rounded-md p-2 hover:bg-white/10 disabled:opacity-30"
                onClick={() => setOpen((o) => (o === null ? o : Math.min(list.length - 1, o + 1)))}
                disabled={open === list.length - 1}
                aria-label={common('next')}
              >
                <ChevronRight />
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
