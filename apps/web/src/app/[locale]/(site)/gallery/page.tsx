import { getTranslations } from 'next-intl/server';
import type { ImageRef, LocalizedText } from '@fitclub/shared';
import { publicApi } from '@/lib/server-api';
import { PageHero, pageMetadata } from '@/components/site/page-hero';
import { GalleryGrid } from '@/components/site/gallery-grid';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'gallery', '/gallery');
}

export default async function GalleryPage() {
  const t = await getTranslations('pages.gallery');
  const items =
    await publicApi<{ id: string; image: ImageRef; caption: LocalizedText; category: string }[]>(
      '/content/collections/gallery',
    );
  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      <section className="container-page py-14">
        <GalleryGrid items={items ?? []} />
      </section>
    </>
  );
}
