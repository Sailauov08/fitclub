'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Bell, CalendarDays, CreditCard, Dumbbell, Home, LogOut, Shield, Ticket, UserRound } from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { Logo } from '@/components/site/brand';
import { LocaleSwitcher } from '@/components/site/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/account', key: 'overview', icon: Home },
  { href: '/account/membership', key: 'membership', icon: Ticket },
  { href: '/account/bookings', key: 'bookings', icon: CalendarDays },
  { href: '/account/training', key: 'training', icon: Dumbbell },
  { href: '/account/payments', key: 'payments', icon: CreditCard },
  { href: '/account/notifications', key: 'notifications', icon: Bell },
  { href: '/account/profile', key: 'profile', icon: UserRound },
] as const;

export function AccountShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const t = useTranslations('account.nav');
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    qc.setQueryData(['me'], me);
  }, [me, qc]);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    router.replace('/');
    router.refresh();
  };
  const name = `${me.profile?.firstName ?? ''} ${me.profile?.lastName ?? ''}`.trim() || me.email;
  const isActive = (href: string) => (href === '/account' ? pathname === href : pathname.startsWith(href));

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="container-page flex h-16 items-center gap-4">
          <Link href="/" aria-label="FITCLUB">
            <Logo />
          </Link>
          <span className="hidden text-sm text-muted sm:inline">/ {t('title')}</span>
          <div className="ml-auto flex items-center gap-1">
            {me.staff && (
              <Link
                href="/admin"
                className="hidden h-9 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-surface-2 sm:inline-flex"
              >
                <Shield className="size-4" /> {t('admin')}
              </Link>
            )}
            <ThemeToggle />
            <LocaleSwitcher />
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">{t('logout')}</span>
            </button>
          </div>
        </div>
        <nav aria-label={t('title')} className="container-page -mb-px flex gap-1 overflow-x-auto lg:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'shrink-0 border-b-2 px-3 py-3 text-sm font-medium',
                isActive(item.href) ? 'border-primary text-foreground' : 'border-transparent text-muted',
              )}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
      </header>
      <div className="container-page grid gap-10 py-8 lg:grid-cols-[230px_1fr] lg:py-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="flex items-center gap-3">
              <Avatar src={me.profile?.avatarUrl} name={name} className="size-11" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{name}</p>
                {me.member && (
                  <p className="text-xs text-muted">FC-{String(me.member.memberNumber).padStart(6, '0')}</p>
                )}
              </div>
            </div>
            <nav aria-label={t('title')} className="mt-8 space-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-surface-2 text-foreground'
                      : 'text-muted hover:bg-surface-2/60 hover:text-foreground',
                  )}
                >
                  <item.icon className={cn('size-4', isActive(item.href) && 'text-primary')} />
                  {t(item.key)}
                </Link>
              ))}
            </nav>
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
