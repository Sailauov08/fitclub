import { getTranslations } from 'next-intl/server';
import { CalendarClock, Sparkles } from 'lucide-react';
import { formatKzt, pickLocale, type Locale, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { publicApi } from '@/lib/server-api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';
import { CmsImage } from '@/components/site/content';
import { PageHero, pageMetadata } from '@/components/site/page-hero';
import { formatClubDate } from '@/lib/intl';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'promotions', '/promotions');
}

export default async function PromotionsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.promotions');
  const common = await getTranslations('common');
  const promos = await publicApi<
    {
      id: string;
      code: string | null;
      name: LocalizedText;
      description: LocalizedText;
      type: 'PERCENT' | 'FIXED';
      value: number;
      validUntil: string | null;
      imageUrl: string | null;
      newMembersOnly: boolean;
    }[]
  >('/promotions');
  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      <section className="container-page py-16">
        {!promos?.length ? (
          <EmptyState
            icon={<Sparkles />}
            title={t('empty')}
            action={
              <Button asChild>
                <Link href="/memberships">{t('seePlans')}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {promos.map((p) => (
              <article
                key={p.id}
                className="grid overflow-hidden rounded-2xl border border-border bg-surface sm:grid-cols-[1fr_1.1fr]"
              >
                <CmsImage
                  url={p.imageUrl}
                  alt=""
                  locale={locale}
                  demoLabel={common('demoPhoto')}
                  className="aspect-[4/3] sm:aspect-auto"
                />
                <div className="flex flex-col p-7">
                  <p className="font-display text-4xl font-semibold text-primary">
                    {p.type === 'PERCENT' ? `−${p.value}%` : `−${formatKzt(p.value, locale)}`}
                  </p>
                  <h2 className="mt-4 text-xl font-semibold">{pickLocale(p.name, locale)}</h2>
                  <p className="mt-2 flex-1 text-sm text-muted">{pickLocale(p.description, locale)}</p>
                  {p.newMembersOnly && <p className="mt-3 text-xs font-medium text-muted">{t('newOnly')}</p>}
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    {p.code ? (
                      <code className="rounded-md border border-dashed border-primary/60 px-3 py-1.5 text-sm font-semibold tracking-wider text-primary">
                        {p.code}
                      </code>
                    ) : (
                      <span />
                    )}
                    {p.validUntil && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                        <CalendarClock className="size-3.5" />{' '}
                        {t('until', {
                          date: formatClubDate(new Date(new Date(p.validUntil).getTime() - 1), locale, 'dayMonth'),
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
