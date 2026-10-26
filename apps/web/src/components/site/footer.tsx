import { getLocale, getTranslations } from 'next-intl/server';
import { Mail, Phone, Send } from 'lucide-react';
import { pickLocale, type Locale, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { publicApi } from '@/lib/server-api';
import type { Branch } from '@/lib/types';
import { Logo } from './brand';
import { LocaleSwitcher } from './locale-switcher';

/** Lucide dropped brand marks, so the Instagram glyph is drawn inline. */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

interface PublicSettings {
  name: string;
  tagline: LocalizedText;
  contact: { phone: string; email: string; instagram?: string; telegram?: string; whatsapp?: string };
}

export async function SiteFooter() {
  const t = await getTranslations('footer');
  const nav = await getTranslations('nav');
  const locale = (await getLocale()) as Locale;
  const [settings, branches] = await Promise.all([
    publicApi<PublicSettings>('/settings/public'),
    publicApi<Branch[]>('/branches'),
  ]);

  const columns = [
    { title: t('train'), links: ['memberships', 'classes', 'schedule', 'trainers', 'personalTraining'] as const },
    { title: t('club'), links: ['about', 'facilities', 'gallery', 'locations', 'promotions', 'blog'] as const },
    { title: t('help'), links: ['faq', 'contact', 'privacy', 'terms'] as const },
  ];
  const hrefs: Record<string, string> = {
    memberships: '/memberships',
    classes: '/classes',
    schedule: '/schedule',
    trainers: '/trainers',
    personalTraining: '/personal-training',
    about: '/about',
    facilities: '/facilities',
    gallery: '/gallery',
    locations: '/locations',
    promotions: '/promotions',
    blog: '/blog',
    faq: '/faq',
    contact: '/contact',
    privacy: '/privacy',
    terms: '/terms',
  };

  return (
    <footer className="grain bg-ink text-bone">
      <div className="container-page pb-10 pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <Logo inverse className="text-3xl" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-bone/60">
              {pickLocale(settings?.tagline, locale) || t('tagline')}
            </p>
            {settings?.contact && (
              <ul className="mt-8 space-y-3 text-sm text-bone/80">
                {settings.contact.phone && (
                  <li>
                    <a
                      href={`tel:${settings.contact.phone.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-2 hover:text-bone"
                    >
                      <Phone className="size-4 text-ember" /> {settings.contact.phone}
                    </a>
                  </li>
                )}
                {settings.contact.email && (
                  <li>
                    <a
                      href={`mailto:${settings.contact.email}`}
                      className="inline-flex items-center gap-2 hover:text-bone"
                    >
                      <Mail className="size-4 text-ember" /> {settings.contact.email}
                    </a>
                  </li>
                )}
                <li className="flex gap-4 pt-2">
                  {settings.contact.instagram && (
                    <a
                      href={`https://instagram.com/${settings.contact.instagram.replace(/^@/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Instagram"
                      className="hover:text-bone"
                    >
                      <InstagramIcon className="size-5" />
                    </a>
                  )}
                  {settings.contact.telegram && (
                    <a
                      href={`https://t.me/${settings.contact.telegram.replace(/^@/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Telegram"
                      className="hover:text-bone"
                    >
                      <Send className="size-5" />
                    </a>
                  )}
                </li>
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="eyebrow text-bone/40">{col.title}</p>
                <ul className="mt-5 space-y-3 text-sm">
                  {col.links.map((key) => (
                    <li key={key}>
                      <Link href={hrefs[key]!} className="text-bone/75 transition-colors hover:text-bone">
                        {nav(key)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        {branches && branches.length > 0 && (
          <div className="mt-16 grid gap-6 border-t border-white/10 pt-10 sm:grid-cols-3">
            {branches.map((b) => (
              <div key={b.id} className="text-sm">
                <p className="font-semibold">{pickLocale(b.name, locale)}</p>
                <p className="mt-1 text-bone/55">
                  {pickLocale(b.city, locale)}, {pickLocale(b.address, locale)}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-16 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-bone/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} FITCLUB. {t('demoNote')}
          </p>
          <LocaleSwitcher inverse />
        </div>
      </div>
      <div aria-hidden className="pointer-events-none select-none overflow-hidden">
        <p className="display -mb-[0.18em] whitespace-nowrap text-center text-[22vw] leading-none text-white/[0.04]">
          FITCLUB
        </p>
      </div>
    </footer>
  );
}
