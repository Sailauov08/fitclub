import { getTranslations } from 'next-intl/server';
import type { LocalizedText } from '@fitclub/shared';
import { publicApi } from '@/lib/server-api';
import { PageHero, pageMetadata } from '@/components/site/page-hero';
import { ScheduleBoard } from '@/components/site/schedule-board';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'schedule', '/schedule');
}

export default async function SchedulePage() {
  const t = await getTranslations('pages.schedule');
  const [branches, categories] = await Promise.all([
    publicApi<{ id: string; name: LocalizedText }[]>('/branches'),
    publicApi<{ id: string; name: LocalizedText }[]>('/classes/categories'),
  ]);
  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      <section className="container-page py-12 sm:py-16">
        <ScheduleBoard branches={branches ?? []} categories={categories ?? []} />
      </section>
    </>
  );
}
