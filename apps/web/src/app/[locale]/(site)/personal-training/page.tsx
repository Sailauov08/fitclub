import { getTranslations } from 'next-intl/server';
import type { Locale, LocalizedText } from '@fitclub/shared';
import { publicApi } from '@/lib/server-api';
import { block, CmsImage, Markdown } from '@/components/site/content';
import { pageMetadata } from '@/components/site/page-hero';
import { TrainerCard } from '@/components/site/cards';
import { LeadForm } from '@/components/site/lead-form';
import { Reveal } from '@/components/site/motion';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'personalTraining', '/personal-training');
}

export default async function PersonalTrainingPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.personalTraining');
  const common = await getTranslations('common');
  const [raw, trainers, branches] = await Promise.all([
    publicApi<unknown>('/content/blocks/personal-training'),
    publicApi<
      {
        id: string;
        slug: string;
        displayName: string;
        headline: LocalizedText;
        photoUrl: string | null;
        specializations: string[];
        offersPersonalTraining: boolean;
      }[]
    >('/trainers'),
    publicApi<{ id: string; name: LocalizedText }[]>('/branches'),
  ]);
  const b = block(raw, locale);
  const coaches = (trainers ?? []).filter((tr) => tr.offersPersonalTraining);

  return (
    <>
      <section className="relative -mt-16 bg-ink pt-16 text-bone">
        <div className="container-page grid gap-12 pb-20 pt-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow flex items-center gap-3 text-bone/60">
              <span className="size-1.5 rounded-full bg-ember" /> {t('eyebrow')}
            </p>
            <h1 className="display mt-6 text-[2.6rem] sm:text-[3.6rem] lg:text-[4.4rem]">
              {b.text('title', t('title'))}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-bone/70">{b.text('lead', t('lead'))}</p>
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
      <section className="container-page grid gap-12 py-20 lg:grid-cols-[1fr_1.2fr]">
        <Markdown className="text-[1.05rem]">{b.text('body')}</Markdown>
        <ol className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          {b.items.map((step, i) => (
            <Reveal
              as="li"
              key={step.title}
              delay={i * 0.06}
              className="rounded-xl border border-border bg-surface p-6"
            >
              <p className="font-semibold">{step.title}</p>
              <p className="mt-1 text-sm text-muted">{step.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>
      {coaches.length > 0 && (
        <section className="border-t border-border bg-surface-2/50 py-20">
          <div className="container-page">
            <h2 className="display text-3xl">{t('coaches')}</h2>
            <div className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
              {coaches.map((tr) => (
                <TrainerCard key={tr.id} trainer={tr} locale={locale} />
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="container-page py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="display text-3xl">{t('formTitle')}</h2>
          <p className="mt-3 text-muted">{t('formLead')}</p>
          <LeadForm source="TRIAL_REQUEST" branches={branches ?? []} interest="Personal training" className="mt-8" />
        </div>
      </section>
    </>
  );
}
