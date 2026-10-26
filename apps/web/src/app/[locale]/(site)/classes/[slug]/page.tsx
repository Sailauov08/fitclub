import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, Clock, Gauge, Users } from 'lucide-react';
import { pickLocale, type Locale, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { publicApi } from '@/lib/server-api';
import { Button } from '@/components/ui/button';
import { DemoTag } from '@/components/site/brand';
import { IntensityDots } from '@/components/site/cards';
import { UpcomingSessions } from '@/components/site/upcoming-sessions';

interface ClassDetail {
  id: string;
  slug: string;
  name: LocalizedText;
  summary: LocalizedText;
  description: LocalizedText;
  difficulty: string;
  durationMinutes: number;
  defaultCapacity: number;
  intensity: number;
  imageUrl: string | null;
  category: { name: LocalizedText };
  trainers: { id: string; slug: string; displayName: string; photoUrl: string | null; headline: LocalizedText }[];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const item = await publicApi<ClassDetail>(`/classes/types/${slug}`);
  if (!item) return {};
  return {
    title: pickLocale(item.name, locale),
    description: pickLocale(item.summary, locale),
    openGraph: { images: item.imageUrl ? [item.imageUrl] : [] },
  };
}

export default async function ClassDetailPage({ params }: { params: Promise<{ locale: Locale; slug: string }> }) {
  const { locale, slug } = await params;
  const item = await publicApi<ClassDetail>(`/classes/types/${slug}`, { revalidate: 30, required: true });
  if (!item) notFound();
  const t = await getTranslations('pages.classDetail');
  const classesT = await getTranslations('classes');
  const common = await getTranslations('common');

  return (
    <>
      <section className="relative -mt-16 flex min-h-[70svh] items-end overflow-hidden bg-ink text-bone">
        {item.imageUrl && (
          <Image
            src={item.imageUrl}
            alt={pickLocale(item.name, locale)}
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-60"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/20" />
        {item.imageUrl && <DemoTag label={common('demoPhoto')} className="right-4 top-24 bottom-auto" />}
        <div className="container-page relative pb-14 pt-40">
          <Link href="/classes" className="text-sm text-bone/70 hover:text-bone">
            ← {t('allClasses')}
          </Link>
          <p className="eyebrow mt-8 text-ember">{pickLocale(item.category.name, locale)}</p>
          <h1 className="display mt-4 text-[2.8rem] sm:text-[4rem] lg:text-[5rem]">{pickLocale(item.name, locale)}</h1>
          <div className="mt-8 flex flex-wrap gap-6 text-sm text-bone/80">
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4 text-ember" /> {classesT('minutes', { count: item.durationMinutes })}
            </span>
            <span className="inline-flex items-center gap-2">
              <Gauge className="size-4 text-ember" /> {classesT(`difficulty.${item.difficulty}`)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Users className="size-4 text-ember" /> {t('upTo', { count: item.defaultCapacity })}
            </span>
            <span className="inline-flex items-center gap-2">
              {classesT('intensity')} <IntensityDots value={item.intensity} label={classesT('intensity')} />
            </span>
          </div>
        </div>
      </section>

      <section className="container-page grid gap-14 py-20 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="text-xl leading-relaxed">{pickLocale(item.summary, locale)}</p>
          <p className="mt-6 leading-relaxed text-muted">{pickLocale(item.description, locale)}</p>
          {item.trainers.length > 0 && (
            <div className="mt-12">
              <h2 className="eyebrow text-muted">{t('coaches')}</h2>
              <ul className="mt-5 flex flex-wrap gap-4">
                {item.trainers.map((tr) => (
                  <li key={tr.id}>
                    <Link
                      href={`/trainers/${tr.slug}`}
                      className="flex items-center gap-3 rounded-full border border-border py-1.5 pl-1.5 pr-4 hover:border-foreground"
                    >
                      <span className="relative size-10 overflow-hidden rounded-full bg-surface-2">
                        {tr.photoUrl && <Image src={tr.photoUrl} alt="" fill sizes="40px" className="object-cover" />}
                      </span>
                      <span className="text-sm font-medium">{tr.displayName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">{t('upcoming')}</h2>
          <UpcomingSessions classTypeId={item.id} className="mt-6" />
          <Button asChild variant="outline" className="mt-6">
            <Link href="/schedule">
              {t('fullSchedule')} <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
