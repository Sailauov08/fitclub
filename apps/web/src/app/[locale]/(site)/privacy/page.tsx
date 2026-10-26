import { getTranslations } from 'next-intl/server';
import type { Locale } from '@fitclub/shared';
import { LegalPage } from '@/components/site/legal-page';
import { pageMetadata } from '@/components/site/page-hero';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'privacy', '/privacy');
}

export default async function Page({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.privacy');
  return <LegalPage blockKey="legal.privacy" locale={locale} fallbackTitle={t('title')} />;
}
