import { getTranslations } from 'next-intl/server';
import type { Locale } from '@fitclub/shared';
import { LegalPage } from '@/components/site/legal-page';
import { pageMetadata } from '@/components/site/page-hero';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'terms', '/terms');
}

export default async function Page({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.terms');
  return <LegalPage blockKey="legal.terms" locale={locale} fallbackTitle={t('title')} />;
}
