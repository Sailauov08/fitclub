import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { pickLocale, type Locale, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { publicApi } from '@/lib/server-api';
import { Button } from '@/components/ui/button';
import { PageHero, pageMetadata } from '@/components/site/page-hero';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'faq', '/faq');
}

const ORDER = ['membership', 'classes', 'payments', 'club'] as const;

export default async function FaqPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.faq');
  const items =
    (await publicApi<{ id: string; question: LocalizedText; answer: LocalizedText; category: string }[]>(
      '/content/collections/faq',
    )) ?? [];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: pickLocale(q.question, locale),
      acceptedAnswer: { '@type': 'Answer', text: pickLocale(q.answer, locale) },
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      <section className="container-page max-w-4xl py-16">
        {ORDER.filter((c) => items.some((q) => q.category === c)).map((cat) => (
          <div key={cat} className="mb-14">
            <h2 className="eyebrow text-muted">{t(`categories.${cat}`)}</h2>
            <div className="mt-4 divide-y divide-border border-y border-border">
              {items
                .filter((q) => q.category === cat)
                .map((q) => (
                  <details key={q.id} className="group py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[1.05rem] font-medium [&::-webkit-details-marker]:hidden">
                      {pickLocale(q.question, locale)}
                      <Plus className="size-5 shrink-0 text-muted transition-transform group-open:rotate-45" />
                    </summary>
                    <p className="mt-3 text-muted">{pickLocale(q.answer, locale)}</p>
                  </details>
                ))}
            </div>
          </div>
        ))}
        <div className="rounded-2xl bg-surface-2 p-8 text-center">
          <p className="font-semibold">{t('stillQuestions')}</p>
          <Button asChild className="mt-4">
            <Link href="/contact">{t('contactUs')}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
