import { getLocale, getTranslations } from 'next-intl/server';
import { pickLocale, type Locale, type LocalizedText } from '@fitclub/shared';
import { SiteFooter } from '@/components/site/footer';
import { SiteHeaderSwitch } from '@/components/site/header-switch';
import { publicApi } from '@/lib/server-api';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('common');
  const announcements = await publicApi<{ id: string; message: LocalizedText; linkUrl: string | null }[]>(
    '/content/collections/announcements',
  );
  const announcement = announcements?.[0];
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
      >
        {t('skipToContent')}
      </a>
      {announcement && (
        <div className="relative z-50 bg-ember px-4 py-2 text-center text-xs font-medium text-white">
          {announcement.linkUrl ? (
            <a href={announcement.linkUrl} className="underline-offset-2 hover:underline">
              {pickLocale(announcement.message, locale)}
            </a>
          ) : (
            pickLocale(announcement.message, locale)
          )}
        </div>
      )}
      <div className="relative">
        <SiteHeaderSwitch />
        <main id="main">{children}</main>
      </div>
      <SiteFooter />
    </>
  );
}
