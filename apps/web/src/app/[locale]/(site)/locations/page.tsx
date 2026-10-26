import { getTranslations } from 'next-intl/server';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { pickLocale, type Locale } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { publicApi } from '@/lib/server-api';
import type { Branch } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { CmsImage } from '@/components/site/content';
import { PageHero, pageMetadata } from '@/components/site/page-hero';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'locations', '/locations');
}

export default async function LocationsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.locations');
  const days = await getTranslations('weekdays');
  const common = await getTranslations('common');
  const branches = (await publicApi<Branch[]>('/branches')) ?? [];
  const jsonLd = branches.map((b) => ({
    '@context': 'https://schema.org',
    '@type': 'ExerciseGym',
    name: pickLocale(b.name, locale),
    telephone: b.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: pickLocale(b.address, locale),
      addressLocality: pickLocale(b.city, locale),
      addressCountry: 'KZ',
    },
    ...(b.latitude && b.longitude
      ? { geo: { '@type': 'GeoCoordinates', latitude: b.latitude, longitude: b.longitude } }
      : {}),
  }));
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      <section className="container-page space-y-16 py-16">
        {branches.map((b) => {
          const bbox =
            b.latitude && b.longitude
              ? `${b.longitude - 0.01},${b.latitude - 0.006},${b.longitude + 0.01},${b.latitude + 0.006}`
              : null;
          return (
            <article key={b.id} id={b.slug} className="grid gap-8 lg:grid-cols-2">
              <div>
                <CmsImage
                  url={b.imageUrl}
                  alt={pickLocale(b.name, locale)}
                  locale={locale}
                  demoLabel={common('demoPhoto')}
                  className="aspect-[16/10] rounded-2xl"
                />
              </div>
              <div className="flex flex-col">
                <p className="eyebrow text-muted">{pickLocale(b.city, locale)}</p>
                <h2 className="display mt-3 text-3xl">{pickLocale(b.name, locale)}</h2>
                {b.description && <p className="mt-3 text-sm text-muted">{pickLocale(b.description, locale)}</p>}
                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex gap-3">
                    <MapPin className="size-4 text-primary" /> {pickLocale(b.address, locale)}
                  </li>
                  <li className="flex gap-3">
                    <Phone className="size-4 text-primary" />
                    <a href={`tel:${b.phone.replace(/\s/g, '')}`}>{b.phone}</a>
                  </li>
                  {b.email && (
                    <li className="flex gap-3">
                      <Mail className="size-4 text-primary" /> {b.email}
                    </li>
                  )}
                </ul>
                <div className="mt-6 rounded-xl border border-border p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Clock className="size-4 text-primary" /> {t('hours')}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
                    {b.openingHours.map((h, i) => (
                      <div key={i} className="flex justify-between gap-2 sm:block">
                        <dt className="text-muted">{days(String(i))}</dt>
                        <dd className="tabular-nums">{h.closed ? t('closed') : `${h.open}–${h.close}`}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {bbox && (
                  <iframe
                    title={t('mapTitle', { name: pickLocale(b.name, locale) })}
                    className="mt-6 h-56 w-full rounded-xl border border-border"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${b.latitude},${b.longitude}`}
                  />
                )}
                <Button asChild variant="outline" className="mt-6 self-start">
                  <Link href={`/schedule`}>{t('scheduleHere')}</Link>
                </Button>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
