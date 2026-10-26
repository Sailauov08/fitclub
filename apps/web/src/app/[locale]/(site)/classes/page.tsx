import { getTranslations } from 'next-intl/server';
import { pickLocale, type Locale, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { publicApi } from '@/lib/server-api';
import { ClassCard, type ClassTypeCardData } from '@/components/site/cards';
import { PageHero, pageMetadata } from '@/components/site/page-hero';
import { Reveal } from '@/components/site/motion';
import { cn } from '@/lib/utils';

// The ?category= filter is read per request; the API data itself stays cached by publicApi.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'classes', '/classes');
}

export default async function ClassesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { locale } = await params;
  const { category } = await searchParams;
  const t = await getTranslations('pages.classes');
  const [types, categories] = await Promise.all([
    publicApi<(ClassTypeCardData & { category: { id: string; slug: string; name: LocalizedText } })[]>(
      '/classes/types',
    ),
    publicApi<{ id: string; slug: string; name: LocalizedText; _count: { classTypes: number } }[]>(
      '/classes/categories',
    ),
  ]);
  const list = (types ?? []).filter((c) => !category || c.category.slug === category);

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')}>
        <nav aria-label={t('categories')} className="mt-10 flex flex-wrap gap-2">
          {[{ slug: '', name: null as LocalizedText | null }, ...(categories ?? [])].map((c) => {
            const active = (category ?? '') === c.slug;
            return (
              <Link
                key={c.slug || 'all'}
                href={c.slug ? `/classes?category=${c.slug}` : '/classes'}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border-strong hover:border-foreground',
                )}
              >
                {c.name ? pickLocale(c.name, locale) : t('all')}
              </Link>
            );
          })}
        </nav>
      </PageHero>
      <section className="container-page py-16">
        {list.length === 0 ? (
          <p className="text-muted">{t('empty')}</p>
        ) : (
          <div className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c, i) => (
              <Reveal key={c.id} delay={(i % 3) * 0.05}>
                <ClassCard item={c} locale={locale} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
