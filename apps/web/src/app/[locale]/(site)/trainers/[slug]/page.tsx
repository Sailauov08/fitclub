import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Award, MapPin } from 'lucide-react';
import { minutesToHHMM, pickLocale, type Locale, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { publicApi } from '@/lib/server-api';
import { Badge } from '@/components/ui/display';
import { CmsImage } from '@/components/site/content';
import { UpcomingSessions } from '@/components/site/upcoming-sessions';
import { LeadForm } from '@/components/site/lead-form';

interface TrainerDetail {
  id: string;
  slug: string;
  displayName: string;
  headline: LocalizedText;
  bio: LocalizedText;
  specializations: string[];
  certifications: string[];
  experienceYears: number;
  photoUrl: string | null;
  offersPersonalTraining: boolean;
  branch: { id: string; slug: string; name: LocalizedText };
  availability: { weekday: number; startMinute: number; endMinute: number }[];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const tr = await publicApi<TrainerDetail>(`/trainers/${slug}`);
  if (!tr) return {};
  return { title: tr.displayName, description: pickLocale(tr.headline, locale) };
}

export default async function TrainerPage({ params }: { params: Promise<{ locale: Locale; slug: string }> }) {
  const { locale, slug } = await params;
  const tr = await publicApi<TrainerDetail>(`/trainers/${slug}`, { revalidate: 30, required: true });
  if (!tr) notFound();
  const t = await getTranslations('pages.trainerDetail');
  const days = await getTranslations('weekdays');
  const common = await getTranslations('common');
  const branches = (await publicApi<{ id: string; name: LocalizedText }[]>('/branches')) ?? [];

  return (
    <>
      <section className="relative -mt-16 bg-ink pt-16 text-bone">
        <div className="container-page grid gap-10 pb-16 pt-20 lg:grid-cols-[1fr_1.2fr] lg:items-end">
          <CmsImage
            url={tr.photoUrl}
            alt={tr.displayName}
            locale={locale}
            demoLabel={common('demoPhoto')}
            className="aspect-[4/5] max-h-[620px] rounded-2xl"
            priority
          />
          <div className="pb-4">
            <Link href="/trainers" className="text-sm text-bone/60 hover:text-bone">
              ← {t('allTrainers')}
            </Link>
            <p className="eyebrow mt-8 text-ember">{pickLocale(tr.headline, locale)}</p>
            <h1 className="display mt-4 text-[2.6rem] sm:text-[3.6rem]">{tr.displayName}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-bone/70">{pickLocale(tr.bio, locale)}</p>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-bone/80">
              <span className="inline-flex items-center gap-2">
                <Award className="size-4 text-ember" /> {t('experience', { years: tr.experienceYears })}
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="size-4 text-ember" /> {pickLocale(tr.branch.name, locale)}
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {tr.specializations.map((s) => (
                <Badge key={s} tone="dark" className="border-white/15 bg-white/10">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-page grid gap-14 py-20 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-xl font-semibold">{t('classes')}</h2>
          <UpcomingSessions trainerId={tr.id} className="mt-6" />
          {tr.certifications.length > 0 && (
            <div className="mt-12">
              <h2 className="eyebrow text-muted">{t('certifications')}</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {tr.certifications.map((c) => (
                  <li key={c} className="flex gap-2">
                    <Award className="mt-0.5 size-4 text-primary" /> {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tr.availability.length > 0 && (
            <div className="mt-12">
              <h2 className="eyebrow text-muted">{t('availability')}</h2>
              <ul className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {tr.availability.map((a, i) => (
                  <li key={i} className="rounded-lg border border-border px-3 py-2">
                    <span className="font-medium">{days(String(a.weekday))}</span>
                    <span className="block text-muted">
                      {minutesToHHMM(a.startMinute)}–{minutesToHHMM(a.endMinute)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {tr.offersPersonalTraining && (
          <div className="h-fit rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold">
              {t('ptTitle', { name: tr.displayName.split(' ')[0] ?? tr.displayName })}
            </h2>
            <p className="mt-2 text-sm text-muted">{t('ptLead')}</p>
            <LeadForm
              source="TRIAL_REQUEST"
              branches={branches}
              interest={`Personal training: ${tr.displayName}`}
              className="mt-6"
            />
          </div>
        )}
      </section>
    </>
  );
}
