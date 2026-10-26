import { getTranslations } from 'next-intl/server';
import { pickLocale, type ImageRef, type Locale, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { publicApi } from '@/lib/server-api';
import { CmsImage } from '@/components/site/content';
import { PageHero, pageMetadata } from '@/components/site/page-hero';
import { Reveal } from '@/components/site/motion';
import { formatClubDate } from '@/lib/intl';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'blog', '/blog');
}

export default async function BlogPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.blog');
  const common = await getTranslations('common');
  const posts = await publicApi<
    {
      id: string;
      slug: string;
      title: LocalizedText;
      excerpt: LocalizedText;
      coverImage: ImageRef | null;
      tags: string[];
      publishedAt: string;
    }[]
  >('/content/blog');
  const [first, ...rest] = posts ?? [];
  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      <section className="container-page py-16">
        {!first ? (
          <p className="text-muted">{t('empty')}</p>
        ) : (
          <>
            <Link href={`/blog/${first.slug}`} className="group grid gap-8 lg:grid-cols-2 lg:items-center">
              <CmsImage
                image={first.coverImage}
                locale={locale}
                demoLabel={common('demoPhoto')}
                className="aspect-[16/10] rounded-2xl"
                priority
              />
              <div>
                <p className="text-sm text-muted">{formatClubDate(first.publishedAt, locale, 'long')}</p>
                <h2 className="display mt-3 text-3xl transition-colors group-hover:text-primary sm:text-4xl">
                  {pickLocale(first.title, locale)}
                </h2>
                <p className="mt-4 text-lg text-muted">{pickLocale(first.excerpt, locale)}</p>
              </div>
            </Link>
            <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p, i) => (
                <Reveal key={p.id} delay={(i % 3) * 0.05}>
                  <Link href={`/blog/${p.slug}`} className="group block">
                    <CmsImage
                      image={p.coverImage}
                      locale={locale}
                      demoLabel={common('demoPhoto')}
                      className="aspect-[16/10] rounded-xl"
                      sizes="(min-width: 1024px) 33vw, 50vw"
                    />
                    <p className="mt-4 text-sm text-muted">{formatClubDate(p.publishedAt, locale, 'long')}</p>
                    <h3 className="mt-1 text-lg font-semibold group-hover:text-primary">
                      {pickLocale(p.title, locale)}
                    </h3>
                    <p className="mt-1 text-sm text-muted">{pickLocale(p.excerpt, locale)}</p>
                  </Link>
                </Reveal>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
