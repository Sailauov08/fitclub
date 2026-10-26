import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function PageHero({
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-b border-border', className)}>
      <div className="container-page pb-14 pt-16 sm:pb-20 sm:pt-24">
        {eyebrow && (
          <p className="eyebrow flex items-center gap-3 text-muted">
            <span className="size-1.5 rounded-full bg-ember" />
            {eyebrow}
          </p>
        )}
        <h1 className="display mt-5 max-w-4xl text-[2.4rem] sm:text-[3.4rem] lg:text-[4.4rem]">{title}</h1>
        {lead && <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{lead}</p>}
        {children}
      </div>
    </section>
  );
}

/** Localised <title>/<description> plus hreflang alternates for a public page. */
export async function pageMetadata(locale: string, key: string, path: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'pages' });
  const title = t(`${key}.title`);
  const description = t(`${key}.lead`);
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}${path}`])),
    },
    openGraph: { title, description, url: `/${locale}${path}` },
  };
}
