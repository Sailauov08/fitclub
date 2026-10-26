import { getTranslations } from 'next-intl/server';
import { Mail, MapPin, Phone } from 'lucide-react';
import { pickLocale, type Locale } from '@fitclub/shared';
import { publicApi } from '@/lib/server-api';
import type { Branch } from '@/lib/types';
import { LeadForm } from '@/components/site/lead-form';
import { PageHero, pageMetadata } from '@/components/site/page-hero';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'contact', '/contact');
}

export default async function ContactPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.contact');
  const [settings, branches] = await Promise.all([
    publicApi<{ contact: { phone: string; email: string; whatsapp?: string } }>('/settings/public'),
    publicApi<Branch[]>('/branches'),
  ]);
  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      <section className="container-page grid gap-14 py-16 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-8">
          {settings?.contact.phone && (
            <a href={`tel:${settings.contact.phone.replace(/\s/g, '')}`} className="flex gap-4">
              <Phone className="mt-1 size-5 text-primary" />
              <span>
                <span className="block text-sm text-muted">{t('phone')}</span>
                <span className="text-lg font-semibold">{settings.contact.phone}</span>
              </span>
            </a>
          )}
          {settings?.contact.email && (
            <a href={`mailto:${settings.contact.email}`} className="flex gap-4">
              <Mail className="mt-1 size-5 text-primary" />
              <span>
                <span className="block text-sm text-muted">E-mail</span>
                <span className="text-lg font-semibold">{settings.contact.email}</span>
              </span>
            </a>
          )}
          {(branches ?? []).map((b) => (
            <div key={b.id} className="flex gap-4 border-t border-border pt-6">
              <MapPin className="mt-1 size-5 text-primary" />
              <div>
                <p className="font-semibold">{pickLocale(b.name, locale)}</p>
                <p className="text-sm text-muted">
                  {pickLocale(b.city, locale)}, {pickLocale(b.address, locale)}
                </p>
                <p className="text-sm text-muted">{b.phone}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-10">
          <h2 className="font-display text-2xl font-semibold">{t('formTitle')}</h2>
          <p className="mt-2 text-muted">{t('formLead')}</p>
          <LeadForm source="WEBSITE_CONTACT" branches={branches ?? []} className="mt-8" />
        </div>
      </section>
    </>
  );
}
