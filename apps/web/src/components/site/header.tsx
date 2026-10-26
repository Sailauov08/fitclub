'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Menu, UserRound, X } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import {
  Dialog,
  DialogClose,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Logo } from './brand';
import { LocaleSwitcher } from './locale-switcher';

const PRIMARY = [
  { href: '/memberships', key: 'memberships' },
  { href: '/classes', key: 'classes' },
  { href: '/schedule', key: 'schedule' },
  { href: '/trainers', key: 'trainers' },
  { href: '/personal-training', key: 'personalTraining' },
] as const;
const MORE = [
  { href: '/about', key: 'about' },
  { href: '/facilities', key: 'facilities' },
  { href: '/gallery', key: 'gallery' },
  { href: '/locations', key: 'locations' },
  { href: '/promotions', key: 'promotions' },
  { href: '/blog', key: 'blog' },
  { href: '/faq', key: 'faq' },
  { href: '/contact', key: 'contact' },
] as const;

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { data: me } = useMe();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const inverse = overlay && !scrolled;
  const accountHref = me ? (me.staff ? '/admin' : '/account') : '/login';
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-[background,border,color] duration-300',
        inverse
          ? 'border-b border-transparent bg-transparent text-bone'
          : 'border-b border-border bg-background/85 text-foreground backdrop-blur-xl',
      )}
    >
      <div className="container-page flex h-16 items-center gap-6">
        <Link href="/" className="shrink-0" aria-label="FITCLUB">
          <Logo inverse={inverse} />
        </Link>
        <nav aria-label={t('main')} className="hidden flex-1 items-center gap-1 lg:flex">
          {PRIMARY.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                inverse ? 'text-bone/80 hover:text-bone' : 'text-muted hover:text-foreground',
                active(item.href) && (inverse ? 'text-bone' : 'text-foreground'),
              )}
              aria-current={active(item.href) ? 'page' : undefined}
            >
              {t(item.key)}
            </Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium',
                inverse ? 'text-bone/80 hover:text-bone' : 'text-muted hover:text-foreground',
              )}
            >
              {t('club')} <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {MORE.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href}>{t(item.key)}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher inverse={inverse} className="hidden sm:inline-flex" />
          <Link
            href={accountHref}
            className={cn(
              'hidden h-9 items-center gap-2 rounded-md px-3 text-sm font-medium sm:inline-flex',
              inverse ? 'text-bone hover:bg-white/10' : 'hover:bg-surface-2',
            )}
          >
            <UserRound className="size-4" />
            {me ? t('account') : t('login')}
          </Link>
          <Button asChild size="sm" variant={inverse ? 'inverse' : 'primary'} className="hidden h-9 sm:inline-flex">
            <Link href="/memberships">{t('join')}</Link>
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex size-10 items-center justify-center rounded-md lg:hidden',
                  inverse ? 'hover:bg-white/10' : 'hover:bg-surface-2',
                )}
                aria-label={t('openMenu')}
              >
                <Menu className="size-5" />
              </button>
            </DialogTrigger>
            <SheetContent>
              <div className="flex h-16 items-center justify-between border-b border-border px-5">
                <SheetTitle asChild>
                  <span>
                    <Logo />
                  </span>
                </SheetTitle>
                <SheetDescription className="sr-only">{t('main')}</SheetDescription>
                <DialogClose className="rounded-md p-2 hover:bg-surface-2" aria-label={t('closeMenu')}>
                  <X className="size-5" />
                </DialogClose>
              </div>
              <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={t('main')}>
                {[...PRIMARY, ...MORE].map((item) => (
                  <DialogClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'block rounded-md px-3 py-2.5 text-[0.95rem] font-medium hover:bg-surface-2',
                        active(item.href) && 'text-primary',
                      )}
                    >
                      {t(item.key)}
                    </Link>
                  </DialogClose>
                ))}
              </nav>
              <div className="flex flex-col gap-2 border-t border-border p-4">
                <div className="flex items-center justify-between">
                  <LocaleSwitcher />
                  <DialogClose asChild>
                    <Link href={accountHref} className="text-sm font-medium">
                      {me ? t('account') : t('login')}
                    </Link>
                  </DialogClose>
                </div>
                <DialogClose asChild>
                  <Button asChild size="lg">
                    <Link href="/memberships">{t('join')}</Link>
                  </Button>
                </DialogClose>
              </div>
            </SheetContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
