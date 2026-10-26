'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Globe } from 'lucide-react';
import { LOCALES, type Locale } from '@fitclub/shared';
import { usePathname, useRouter } from '@/i18n/navigation';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const LABELS: Record<Locale, string> = { kk: 'Қазақша', ru: 'Русский', en: 'English' };

/** Switches language while keeping the current page; the choice persists in the NEXT_LOCALE cookie. */
export function LocaleSwitcher({ inverse, className }: { inverse?: boolean; className?: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const change = (next: Locale) => {
    start(() => {
      router.replace(`${pathname}${window.location.search}`, { locale: next });
      // Signed-in users also get the preference stored on their account (used for e-mails).
      if (document.cookie.includes('fc_csrf=')) void api.put('/me/locale', { locale: next }).catch(() => undefined);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('language')}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold uppercase tracking-wider transition-colors',
          inverse
            ? 'text-bone/80 hover:bg-white/10 hover:text-bone'
            : 'text-muted hover:bg-surface-2 hover:text-foreground',
          pending && 'opacity-60',
          className,
        )}
      >
        <Globe className="size-3.5" aria-hidden />
        {locale}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onSelect={() => change(l)}
            className={cn(l === locale && 'font-semibold text-primary')}
          >
            <span className="w-6 text-xs uppercase text-muted">{l}</span>
            {LABELS[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
