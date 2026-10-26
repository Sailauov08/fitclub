import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { pickLocale, type ImageRef, type Locale, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { publicApi } from '@/lib/server-api';
import { Badge } from '@/components/ui/display';
import { CmsImage, Markdown } from '@/components/site/content';
import { formatClubDate } from '@/lib/intl';

interface Post {
  slug: string;
  title: LocalizedText;
  excerpt: LocalizedText;
  body: LocalizedText;
  coverImage: ImageRef | null;
  tags: string[];
  publishedAt: string;
  updatedAt: string;
  author: { profile: { firstName: string; lastName: string } | null } | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await publicApi<Post>(`/content/blog/${slug}`);
  if (!post) return {};
  return {
    title: pickLocale(post.title, locale),
    description: pickLocale(post.excerpt, locale),
    openGraph: {
      type: 'article',
      publishedTime: post.publishedAt,
      images: post.coverImage ? [post.coverImage.url] : [],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ locale: Locale; slug: string }> }) {
  const { locale, slug } = await params;
  const post = await publicApi<Post>(`/content/blog/${slug}`, { required: true });
  if (!post) notFound();
  const t = await getTranslations('pages.blog');
  const common = await getTranslations('common');
  const date = formatClubDate(post.publishedAt, locale, 'long');
  const author = post.author?.profile ? `${post.author.profile.firstName} ${post.author.profile.lastName}` : 'FITCLUB';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: pickLocale(post.title, locale),
    description: pickLocale(post.excerpt, locale),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    image: post.coverImage?.url,
    author: { '@type': 'Person', name: author },
    publisher: { '@type': 'Organization', name: 'FITCLUB' },
    inLanguage: locale,
  };
  return (
    <article className="pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <header className="container-page max-w-3xl pb-10 pt-16 sm:pt-24">
        <Link href="/blog" className="text-sm text-muted hover:text-foreground">
          ← {t('back')}
        </Link>
        <div className="mt-8 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        <h1 className="display mt-5 text-[2.2rem] sm:text-[3rem]">{pickLocale(post.title, locale)}</h1>
        <p className="mt-5 text-lg text-muted">{pickLocale(post.excerpt, locale)}</p>
        <p className="mt-6 text-sm text-muted">
          {author} · <time dateTime={post.publishedAt}>{date}</time>
        </p>
      </header>
      <div className="container-page max-w-5xl">
        <CmsImage
          image={post.coverImage}
          locale={locale}
          demoLabel={common('demoPhoto')}
          className="aspect-[16/8] rounded-2xl"
          priority
          sizes="(min-width: 1024px) 1000px, 100vw"
        />
      </div>
      <div className="container-page mt-12 max-w-3xl">
        <Markdown className="text-[1.08rem]">{pickLocale(post.body, locale)}</Markdown>
      </div>
    </article>
  );
}
