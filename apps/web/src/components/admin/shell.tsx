'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarRange,
  ChevronsLeft,
  ClipboardList,
  CreditCard,
  Dumbbell,
  FileText,
  Gauge,
  LayoutGrid,
  LogOut,
  Menu,
  Megaphone,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Ticket,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@fitclub/shared';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import type { Me } from '@/lib/types';
import { Logo } from '@/components/site/brand';
import { LocaleSwitcher } from '@/components/site/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar } from '@/components/ui/controls';
import { Badge } from '@/components/ui/display';
import {
  Dialog,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  key: string;
  icon: LucideIcon;
  any: Permission[];
}
const GROUPS: { key: string; items: NavItem[] }[] = [
  { key: 'main', items: [{ href: '/admin', key: 'overview', icon: Gauge, any: ['dashboard.view'] }] },
  {
    key: 'operations',
    items: [
      { href: '/admin/checkin', key: 'checkin', icon: ScanLine, any: ['checkin.perform'] },
      { href: '/admin/schedule', key: 'schedule', icon: CalendarRange, any: ['schedule.read'] },
      { href: '/admin/members', key: 'members', icon: Users, any: ['members.read', 'members.read_assigned'] },
      { href: '/admin/leads', key: 'leads', icon: ClipboardList, any: ['leads.read'] },
    ],
  },
  {
    key: 'business',
    items: [
      { href: '/admin/payments', key: 'payments', icon: CreditCard, any: ['payments.read'] },
      { href: '/admin/plans', key: 'plans', icon: Ticket, any: ['memberships.read'] },
      { href: '/admin/promotions', key: 'promotions', icon: Tag, any: ['promotions.manage'] },
      { href: '/admin/analytics', key: 'analytics', icon: BarChart3, any: ['analytics.view'] },
    ],
  },
  {
    key: 'club',
    items: [
      { href: '/admin/classes', key: 'classes', icon: LayoutGrid, any: ['classes.manage'] },
      { href: '/admin/trainers', key: 'trainers', icon: UsersRound, any: ['schedule.read'] },
      { href: '/admin/training', key: 'training', icon: Dumbbell, any: ['training.manage_own', 'training.manage_all'] },
      { href: '/admin/branches', key: 'branches', icon: Building2, any: ['branches.manage'] },
      { href: '/admin/content', key: 'content', icon: Megaphone, any: ['content.manage'] },
    ],
  },
  {
    key: 'system',
    items: [
      { href: '/admin/staff', key: 'staff', icon: UserCog, any: ['staff.read'] },
      { href: '/admin/settings', key: 'settings', icon: Settings, any: ['settings.manage'] },
      { href: '/admin/audit', key: 'audit', icon: ShieldCheck, any: ['audit.read'] },
    ],
  },
];

export function AdminShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const t = useTranslations('admin.nav');
  const roles = useTranslations('enums.role');
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const fmt = useFmt();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    qc.setQueryData(['me'], me);
    try {
      setCollapsed(localStorage.getItem('fc-admin-collapsed') === '1');
    } catch {
      /* ignore */
    }
  }, [me, qc]);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('fc-admin-collapsed', c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const can = (perms: Permission[]) => perms.some((p) => me.permissions.includes(p));
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => can(i.any)) })).filter((g) => g.items.length);
  const isActive = (href: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href));
  const name = `${me.profile?.firstName ?? ''} ${me.profile?.lastName ?? ''}`.trim() || me.email;

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api.get<{
        unread: number;
        items: { id: string; title: string; body: string; createdAt: string; readAt: string | null }[];
      }>('/me/notifications'),
    refetchInterval: 60_000,
  });

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    router.replace('/login');
    router.refresh();
  };

  const nav = (compact: boolean) => (
    <nav aria-label={t('label')} className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {groups.map((g) => (
        <div key={g.key}>
          {!compact && g.key !== 'main' && (
            <p className="mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted/80">
              {t(`groups.${g.key}`)}
            </p>
          )}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={compact ? t(item.key) : undefined}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    compact && 'justify-center px-0',
                    isActive(item.href)
                      ? 'bg-foreground text-background'
                      : 'text-muted hover:bg-surface-2 hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {!compact && t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-background">
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-300 lg:flex',
          collapsed ? 'w-[68px]' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center border-b border-border px-4',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {!collapsed && (
            <Link href="/admin" aria-label="FITCLUB">
              <Logo />
            </Link>
          )}
          <button
            type="button"
            onClick={toggle}
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label={collapsed ? t('expand') : t('collapse')}
          >
            <ChevronsLeft className={cn('size-4 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>
        {nav(collapsed)}
        {!collapsed && (
          <div className="border-t border-border p-4 text-xs text-muted">
            <Link href="/" className="hover:text-foreground">
              ← {t('toSite')}
            </Link>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className="rounded-md p-2 hover:bg-surface-2 lg:hidden" aria-label={t('menu')}>
                <Menu className="size-5" />
              </button>
            </DialogTrigger>
            <SheetContent side="left">
              <div className="flex h-16 items-center border-b border-border px-5">
                <SheetTitle asChild>
                  <span>
                    <Logo />
                  </span>
                </SheetTitle>
                <SheetDescription className="sr-only">{t('label')}</SheetDescription>
              </div>
              {nav(false)}
            </SheetContent>
          </Dialog>
          {can(['members.read']) && (
            <form
              className="relative hidden max-w-md flex-1 sm:block"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) router.push(`/admin/members?q=${encodeURIComponent(query.trim())}`);
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('search')}
                className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm focus-visible:border-primary focus-visible:outline-none"
              />
            </form>
          )}
          <div className="ml-auto flex items-center gap-1">
            {me.staff?.branch && <Badge className="mr-2 hidden md:inline-flex">{fmt.t(me.staff.branch.name)}</Badge>}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="relative inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
                aria-label={t('notifications')}
              >
                <Bell className="size-4" />
                {Boolean(notifications.data?.unread) && (
                  <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-80">
                <DropdownMenuLabel>{t('notifications')}</DropdownMenuLabel>
                {!notifications.data?.items.length ? (
                  <p className="px-3 py-6 text-center text-sm text-muted">{t('noNotifications')}</p>
                ) : (
                  notifications.data.items.slice(0, 6).map((n) => (
                    <div key={n.id} className="rounded-md px-2.5 py-2 text-sm">
                      <p className={cn('font-medium', !n.readAt && 'text-primary')}>{n.title}</p>
                      <p className="text-xs text-muted">{n.body}</p>
                      <p className="mt-0.5 text-[0.7rem] text-muted">{fmt.relative(n.createdAt)}</p>
                    </div>
                  ))
                )}
                {Boolean(notifications.data?.unread) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={async () => {
                        await api.post('/me/notifications/read', { ids: 'all' });
                        await notifications.refetch();
                      }}
                    >
                      {t('markRead')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
            <LocaleSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger
                className="ml-1 flex items-center gap-2 rounded-md p-1 hover:bg-surface-2"
                aria-label={t('profile')}
              >
                <Avatar src={me.profile?.avatarUrl} name={name} className="size-8" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>
                  <span className="block font-semibold text-foreground">{name}</span>
                  {me.staff && roles(me.staff.role)}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {me.member && (
                  <DropdownMenuItem asChild>
                    <Link href="/account">
                      <FileText /> {t('memberPortal')}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/account/profile">
                    <UserCog /> {t('myProfile')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={logout}>
                  <LogOut /> {t('logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
