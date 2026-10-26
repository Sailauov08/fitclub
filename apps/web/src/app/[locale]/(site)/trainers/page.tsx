import { getTranslations } from 'next-intl/server';
import type { Locale, LocalizedText } from '@fitclub/shared';
import { publicApi } from '@/lib/server-api';
import { TrainerCard } from '@/components/site/cards';
import { PageHero, pageMetadata } from '@/components/site/page-hero';
import { Reveal } from '@/components/site/motion';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'trainers', '/trainers');
}

export default async function TrainersPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.trainers');
  const trainers = await publicApi<
    {
      id: string;
      slug: string;
      displayName: string;
      headline: LocalizedText;
      photoUrl: string | null;
      specializations: string[];
    }[]
  >('/trainers');
  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      <section className="container-page py-16">
        {!trainers?.length ? (
          <p className="text-muted">{t('empty')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {trainers.map((tr, i) => (
              <Reveal key={tr.id} delay={(i % 4) * 0.05}>
                <TrainerCard trainer={tr} locale={locale} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
