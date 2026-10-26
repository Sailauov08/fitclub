import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import type { Locale, LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { publicApi } from '@/lib/server-api';
import { block, CmsImage, Markdown } from '@/components/site/content';
import { pageMetadata } from '@/components/site/page-hero';
import { Reveal } from '@/components/site/motion';
import { TrainerCard } from '@/components/site/cards';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'about', '/about');
}

export default async function AboutPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.about');
  const common = await getTranslations('common');
  const [about, trainers] = await Promise.all([
    publicApi<unknown>('/content/blocks/about'),
    publicApi<
      {
        id: string;
        slug: string;
        displayName: string;
        headline: LocalizedText;
        photoUrl: string | null;
        specializations: string[];
      }[]
    >('/trainers'),
  ]);
  const b = block(about, locale);

  return (
    <>
      <section className="relative -mt-16 overflow-hidden bg-ink pt-16 text-bone">
        <div className="container-page grid gap-12 pb-20 pt-24 lg:grid-cols-2 lg:items-end lg:pb-28 lg:pt-32">
          <div>
            <p className="eyebrow flex items-center gap-3 text-bone/60">
              <span className="size-1.5 rounded-full bg-ember" />
              {t('eyebrow')}
            </p>
            <h1 className="display mt-6 text-[2.6rem] sm:text-[3.6rem] lg:text-[4.6rem]">
              {b.text('title', t('title'))}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-bone/70">{b.text('lead', t('lead'))}</p>
          </div>
          <CmsImage
            image={b.image('image')}
            locale={locale}
            demoLabel={common('demoPhoto')}
            className="aspect-[4/3] rounded-2xl"
            priority
          />
        </div>
      </section>

      <section className="container-page grid gap-14 py-24 lg:grid-cols-[1.4fr_1fr]">
        <Reveal>
          <Markdown className="max-w-2xl text-[1.05rem]">{b.text('body')}</Markdown>
        </Reveal>
        <div className="space-y-5">
          {b.items.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.06} className="rounded-xl border border-border bg-surface p-7">
              <span className="font-display text-sm text-primary">{String(i + 1).padStart(2, '0')}</span>
              <p className="mt-4 text-lg font-semibold">{item.title}</p>
              <p className="mt-1 text-muted">{item.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {trainers && trainers.length > 0 && (
        <section className="border-t border-border bg-surface-2/50 py-24">
          <div className="container-page">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <h2 className="display text-3xl sm:text-4xl">{t('team')}</h2>
              <Button asChild variant="outline">
                <Link href="/trainers">
                  {t('allTrainers')} <ArrowRight />
                </Link>
              </Button>
            </div>
            <div className="mt-12 grid grid-cols-2 gap-5 lg:grid-cols-4">
              {trainers.slice(0, 4).map((tr) => (
                <TrainerCard key={tr.id} trainer={tr} locale={locale} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
