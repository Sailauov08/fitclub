import { getTranslations } from 'next-intl/server';
import { pickLocale, type ImageRef, type Locale, type LocalizedText } from '@fitclub/shared';
import { publicApi } from '@/lib/server-api';
import { block, CmsImage, ContentIcon } from '@/components/site/content';
import { PageHero, pageMetadata } from '@/components/site/page-hero';
import { Reveal } from '@/components/site/motion';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'facilities', '/facilities');
}

export default async function FacilitiesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.facilities');
  const common = await getTranslations('common');
  const [raw, items, branches] = await Promise.all([
    publicApi<unknown>('/content/blocks/facilities'),
    publicApi<
      {
        id: string;
        name: LocalizedText;
        description: LocalizedText;
        icon: string;
        image: ImageRef | null;
        branchIds: string[];
      }[]
    >('/content/collections/facilities'),
    publicApi<{ id: string; name: LocalizedText }[]>('/branches'),
  ]);
  const b = block(raw, locale);
  const branchName = (id: string) => pickLocale(branches?.find((x) => x.id === id)?.name, locale);
  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={b.text('title', t('title'))} lead={b.text('lead', t('lead'))} />
      <section className="container-page grid gap-6 py-16 md:grid-cols-2">
        {(items ?? []).map((f, i) => (
          <Reveal key={f.id} delay={(i % 2) * 0.06}>
            <article className="overflow-hidden rounded-2xl border border-border bg-surface">
              <CmsImage image={f.image} locale={locale} demoLabel={common('demoPhoto')} className="aspect-[16/9]" />
              <div className="flex gap-4 p-7">
                <ContentIcon name={f.icon} className="mt-1 size-6 shrink-0 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold">{pickLocale(f.name, locale)}</h2>
                  <p className="mt-2 text-muted">{pickLocale(f.description, locale)}</p>
                  <p className="mt-4 text-xs font-medium text-muted">
                    {f.branchIds.length ? f.branchIds.map(branchName).join(' · ') : t('everyBranch')}
                  </p>
                </div>
              </div>
            </article>
          </Reveal>
        ))}
      </section>
    </>
  );
}
