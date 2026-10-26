import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, ArrowUpRight, Clock, MapPin, Plus, Star } from 'lucide-react';
import { formatKzt, pickLocale, type Locale, type LocalizedText, type ImageRef } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { publicApi } from '@/lib/server-api';
import type { Branch, Plan } from '@/lib/types';
import { DemoTag, SectionHeading } from '@/components/site/brand';
import { block, CmsImage, ContentIcon } from '@/components/site/content';
import { ClassCard, PlanCard, TrainerCard, type ClassTypeCardData } from '@/components/site/cards';
import { FadeIn, HeroBackdrop, Reveal, SplitHeadline } from '@/components/site/motion';
import { LeadForm } from '@/components/site/lead-form';

interface HomeData {
  blocks: Record<string, unknown>;
  plans: Plan[];
  classTypes: (ClassTypeCardData & { category: { name: LocalizedText } })[];
  trainers: {
    id: string;
    slug: string;
    displayName: string;
    headline: LocalizedText;
    photoUrl: string | null;
    specializations: string[];
  }[];
  testimonials: { id: string; authorName: string; authorDetail: LocalizedText; quote: LocalizedText; rating: number }[];
  facilities: {
    id: string;
    slug: string;
    name: LocalizedText;
    description: LocalizedText;
    icon: string;
    image: ImageRef | null;
  }[];
  faq: { id: string; question: LocalizedText; answer: LocalizedText }[];
  promotions: {
    id: string;
    code: string | null;
    name: LocalizedText;
    description: LocalizedText;
    type: 'PERCENT' | 'FIXED';
    value: number;
    validUntil: string | null;
    imageUrl: string | null;
  }[];
  branches: Pick<Branch, 'id' | 'slug' | 'name' | 'city' | 'address' | 'phone' | 'openingHours'>[];
  stats: { branches: number; classFormats: number; coaches: number; sessionsThisWeek: number };
}

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('home');
  const common = await getTranslations('common');
  const data = await publicApi<HomeData>('/content/home', { revalidate: 60 });

  if (!data) {
    return (
      <section className="container-page py-40 text-center">
        <h1 className="display text-4xl">FITCLUB</h1>
        <p className="mt-4 text-muted">{common('serviceUnavailable')}</p>
      </section>
    );
  }

  const hero = block(data.blocks['home.hero'], locale);
  const intro = block(data.blocks['home.intro'], locale);
  const benefits = block(data.blocks['home.benefits'], locale);
  const cta = block(data.blocks['home.cta'], locale);
  const heroImage = hero.image('background');
  const demo = common('demoPhoto');

  const stats = [
    { value: data.stats.branches, label: t('stats.branches') },
    { value: data.stats.classFormats, label: t('stats.formats') },
    { value: data.stats.coaches, label: t('stats.coaches') },
    { value: data.stats.sessionsThisWeek, label: t('stats.sessions') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative -mt-16 flex min-h-[100svh] flex-col overflow-hidden bg-ink text-bone">
        <HeroBackdrop>
          {heroImage && (
            <Image
              src={heroImage.url}
              alt={pickLocale(heroImage.alt, locale)}
              fill
              priority
              sizes="100vw"
              className="object-cover object-center opacity-70"
            />
          )}
        </HeroBackdrop>
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/30 to-ink" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/20 to-transparent" />
        {heroImage?.isDemo && <DemoTag label={demo} className="bottom-4 right-4" />}
        <div className="container-page relative flex flex-1 flex-col justify-end pb-16 pt-40 sm:pb-20">
          <FadeIn className="eyebrow flex items-center gap-3 text-bone/70">
            <span className="size-1.5 rounded-full bg-ember" />
            {hero.text('eyebrow')}
          </FadeIn>
          <SplitHeadline
            text={hero.text('title', 'FITCLUB')}
            className="mt-6 max-w-5xl text-[2.9rem] leading-[0.95] sm:text-[4.6rem] lg:text-[6.2rem]"
          />
          <FadeIn delay={0.5} className="mt-8 max-w-xl text-base leading-relaxed text-bone/75 sm:text-lg">
            {hero.text('subtitle')}
          </FadeIn>
          <FadeIn delay={0.65} className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="xl">
              <Link href="/register">
                {hero.text('primaryCta', t('join'))} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="xl" variant="inverse-outline">
              <Link href="/memberships">{hero.text('secondaryCta', t('viewMemberships'))}</Link>
            </Button>
          </FadeIn>
          <FadeIn
            delay={0.8}
            className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-4"
          >
            {stats.map((s) => (
              <div key={s.label} className="bg-ink/60 px-5 py-4 backdrop-blur-md">
                <p className="font-display text-2xl font-semibold tabular-nums sm:text-3xl">{s.value}</p>
                <p className="mt-1 text-xs text-bone/60">{s.label}</p>
              </div>
            ))}
          </FadeIn>
        </div>
      </section>

      {/* Marquee of class formats */}
      {data.classTypes.length > 0 && (
        <div className="overflow-hidden border-b border-border bg-background py-5" aria-hidden>
          <div className="animate-marquee flex w-max gap-12 whitespace-nowrap">
            {[...data.classTypes, ...data.classTypes, ...data.classTypes, ...data.classTypes].map((c, i) => (
              <span
                key={`${c.id}-${i}`}
                className="flex items-center gap-12 font-display text-2xl font-semibold uppercase tracking-tight text-foreground/80"
              >
                {pickLocale(c.name, locale)}
                <span className="size-2 rounded-[2px] bg-ember" />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 01 Intro */}
      <section className="container-page grid items-center gap-12 py-24 lg:grid-cols-2 lg:gap-20 lg:py-32">
        <Reveal>
          <SectionHeading
            index="01"
            eyebrow={t('introEyebrow')}
            title={intro.text('title')}
            lead={intro.text('body')}
          />
          <ul className="mt-10 grid gap-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {intro.items.map((item) => (
              <li key={item.title} className="border-t border-border pt-5">
                <ContentIcon name={item.icon} className="size-5 text-primary" />
                <p className="mt-3 font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <CmsImage
            image={intro.image('image')}
            locale={locale}
            demoLabel={demo}
            className="aspect-[4/5] rounded-2xl"
          />
        </Reveal>
      </section>

      {/* 02 Memberships */}
      <section className="border-y border-border bg-surface-2/50 py-24 lg:py-32">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading index="02" eyebrow={t('plansEyebrow')} title={t('plansTitle')} lead={t('plansLead')} />
            <Button asChild variant="outline">
              <Link href="/memberships">
                {t('comparePlans')} <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {data.plans.map((plan, i) => (
              <Reveal key={plan.id} delay={i * 0.06}>
                <PlanCard plan={plan} locale={locale} compact />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 03 Classes */}
      <section className="container-page py-24 lg:py-32">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading index="03" eyebrow={t('classesEyebrow')} title={t('classesTitle')} lead={t('classesLead')} />
          <Button asChild variant="outline">
            <Link href="/schedule">
              {t('seeSchedule')} <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {data.classTypes.slice(0, 6).map((c, i) => (
            <Reveal key={c.id} delay={(i % 3) * 0.06}>
              <ClassCard item={c} locale={locale} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* 04 Benefits — dark band */}
      <section className="grain bg-ink py-24 text-bone lg:py-32">
        <div className="container-page">
          <SectionHeading
            index="04"
            eyebrow={t('benefitsEyebrow')}
            title={benefits.text('title')}
            lead={benefits.text('subtitle')}
            inverse
          />
          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.items.map((item, i) => (
              <Reveal key={item.title} delay={i * 0.06} className="bg-ink p-8">
                <span className="font-display text-sm text-ember">{String(i + 1).padStart(2, '0')}</span>
                <ContentIcon name={item.icon} className="mt-10 size-7 text-bone" />
                <p className="mt-6 text-lg font-semibold">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-bone/60">{item.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 05 Trainers */}
      <section className="container-page py-24 lg:py-32">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            index="05"
            eyebrow={t('trainersEyebrow')}
            title={t('trainersTitle')}
            lead={t('trainersLead')}
          />
          <Button asChild variant="outline">
            <Link href="/trainers">
              {t('allTrainers')} <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="mt-14 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {data.trainers.map((tr, i) => (
            <Reveal key={tr.id} delay={i * 0.06}>
              <TrainerCard trainer={tr} locale={locale} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* 06 Facilities */}
      <section className="border-t border-border bg-surface-2/50 py-24 lg:py-32">
        <div className="container-page">
          <SectionHeading index="06" eyebrow={t('facilitiesEyebrow')} title={t('facilitiesTitle')} />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.facilities.map((f, i) => (
              <Reveal key={f.id} delay={(i % 3) * 0.06}>
                <article className="group overflow-hidden rounded-xl border border-border bg-surface">
                  <CmsImage
                    image={f.image}
                    locale={locale}
                    demoLabel={demo}
                    className="aspect-[16/10]"
                    sizes="(min-width: 1024px) 33vw, 50vw"
                  />
                  <div className="flex gap-4 p-6">
                    <ContentIcon name={f.icon} className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <h3 className="font-semibold">{pickLocale(f.name, locale)}</h3>
                      <p className="mt-1 text-sm text-muted">{pickLocale(f.description, locale)}</p>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
          <div className="mt-10">
            <Button asChild variant="link">
              <Link href="/facilities">
                {t('allFacilities')} <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 07 Testimonials */}
      {data.testimonials.length > 0 && (
        <section className="container-page py-24 lg:py-32">
          <SectionHeading index="07" eyebrow={t('testimonialsEyebrow')} title={t('testimonialsTitle')} />
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {data.testimonials.slice(0, 3).map((r, i) => (
              <Reveal key={r.id} delay={i * 0.06}>
                <figure className="flex h-full flex-col rounded-xl border border-border bg-surface p-8">
                  <div className="flex gap-0.5 text-ember" role="img" aria-label={t('rating', { value: r.rating })}>
                    {Array.from({ length: 5 }, (_, s) => (
                      <Star key={s} className={s < r.rating ? 'size-4 fill-current' : 'size-4 opacity-25'} />
                    ))}
                  </div>
                  <blockquote className="mt-6 flex-1 text-lg leading-relaxed">
                    “{pickLocale(r.quote, locale)}”
                  </blockquote>
                  <figcaption className="mt-8 border-t border-border pt-5 text-sm">
                    <span className="font-semibold">{r.authorName}</span>
                    <span className="block text-muted">{pickLocale(r.authorDetail, locale)}</span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* 08 Promotions */}
      {data.promotions.length > 0 && (
        <section className="container-page pb-24 lg:pb-32">
          <div className="grid gap-5 lg:grid-cols-3">
            {data.promotions.map((p) => (
              <Reveal key={p.id}>
                <article className="relative flex h-full flex-col justify-between overflow-hidden rounded-xl bg-ink p-8 text-bone">
                  <div>
                    <p className="eyebrow text-ember">{t('offer')}</p>
                    <h3 className="mt-3 font-display text-2xl font-semibold">{pickLocale(p.name, locale)}</h3>
                    <p className="mt-2 text-sm text-bone/65">{pickLocale(p.description, locale)}</p>
                  </div>
                  <div className="mt-8 flex items-end justify-between gap-4">
                    <span className="font-display text-5xl font-semibold text-ember">
                      {p.type === 'PERCENT' ? `−${p.value}%` : `−${formatKzt(p.value, locale)}`}
                    </span>
                    {p.code && (
                      <code className="rounded-md border border-white/20 px-2.5 py-1 text-sm font-semibold tracking-wider">
                        {p.code}
                      </code>
                    )}
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* 09 FAQ */}
      <section className="border-t border-border py-24 lg:py-32">
        <div className="container-page grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <SectionHeading index="08" eyebrow={t('faqEyebrow')} title={t('faqTitle')} />
            <Button asChild variant="link" className="mt-6">
              <Link href="/faq">
                {t('allQuestions')} <ArrowUpRight />
              </Link>
            </Button>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {data.faq.map((q) => (
              <details key={q.id} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left text-[1.05rem] font-medium [&::-webkit-details-marker]:hidden">
                  {pickLocale(q.question, locale)}
                  <Plus className="size-5 shrink-0 text-muted transition-transform duration-300 group-open:rotate-45" />
                </summary>
                <p className="mt-3 max-w-2xl text-muted">{pickLocale(q.answer, locale)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 10 Locations + trial request */}
      <section className="grain relative overflow-hidden bg-ink py-24 text-bone lg:py-32">
        {cta.image('image') && (
          <>
            <Image src={cta.image('image')!.url} alt="" fill sizes="100vw" className="object-cover opacity-25" />
            <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/90 to-ink/60" />
          </>
        )}
        <div className="container-page relative grid gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              index="09"
              eyebrow={t('locationsEyebrow')}
              title={cta.text('title')}
              lead={cta.text('body')}
              inverse
            />
            <ul className="mt-12 space-y-6">
              {data.branches.map((b) => (
                <li key={b.id} className="flex gap-4 border-t border-white/10 pt-6">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-ember" />
                  <div>
                    <p className="font-semibold">{pickLocale(b.name, locale)}</p>
                    <p className="text-sm text-bone/60">
                      {pickLocale(b.city, locale)}, {pickLocale(b.address, locale)}
                    </p>
                    {b.openingHours[0] && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-bone/50">
                        <Clock className="size-3.5" /> {t('weekdays')} {b.openingHours[0].open}–
                        {b.openingHours[0].close}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink/70 p-6 backdrop-blur-md sm:p-10">
            <p className="eyebrow text-ember">{t('trialEyebrow')}</p>
            <h3 className="mt-3 font-display text-2xl font-semibold">{t('trialTitle')}</h3>
            <LeadForm source="TRIAL_REQUEST" branches={data.branches} inverse className="mt-8" />
          </div>
        </div>
      </section>
    </>
  );
}
