import { getTranslations } from 'next-intl/server';
import { Check, Minus, Plus } from 'lucide-react';
import { formatKzt, pickLocale, type Locale, type LocalizedText } from '@fitclub/shared';
import { publicApi } from '@/lib/server-api';
import type { Plan } from '@/lib/types';
import { PlanCard } from '@/components/site/cards';
import { PageHero, pageMetadata } from '@/components/site/page-hero';
import { Reveal } from '@/components/site/motion';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, 'memberships', '/memberships');
}

export default async function MembershipsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations('pages.memberships');
  const plansT = await getTranslations('plans');
  const [plans, faq] = await Promise.all([
    publicApi<Plan[]>('/plans'),
    publicApi<{ id: string; question: LocalizedText; answer: LocalizedText; category: string }[]>(
      '/content/collections/faq',
    ),
  ]);
  const list = plans ?? [];
  const rows: { label: string; value: (p: Plan) => React.ReactNode }[] = [
    { label: t('compare.price'), value: (p) => (p.price === 0 ? plansT('free') : formatKzt(p.price, locale)) },
    { label: t('compare.duration'), value: (p) => plansT('duration', { days: p.durationDays }) },
    {
      label: t('compare.visits'),
      value: (p) => (p.visitLimit ? plansT('visits', { count: p.visitLimit }) : plansT('unlimitedVisits')),
    },
    {
      label: t('compare.classes'),
      value: (p) =>
        p.includesClasses ? (
          <Check className="size-4 text-success" aria-label={t('compare.yes')} />
        ) : (
          <Minus className="size-4 text-muted" aria-label={t('compare.no')} />
        ),
    },
    {
      label: t('compare.branches'),
      value: (p) =>
        p.allBranches ? t('compare.allBranches') : t('compare.someBranches', { count: p.branchIds.length }),
    },
    {
      label: t('compare.freeze'),
      value: (p) =>
        p.freezeMaxDays > 0 ? (
          plansT('duration', { days: p.freezeMaxDays })
        ) : (
          <Minus className="size-4 text-muted" aria-label={t('compare.no')} />
        ),
    },
  ];

  return (
    <>
      <PageHero eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      <section className="container-page py-16 sm:py-20">
        {list.length === 0 ? (
          <p className="text-muted">{t('empty')}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {list.map((plan, i) => (
              <Reveal key={plan.id} delay={(i % 3) * 0.05}>
                <PlanCard plan={plan} locale={locale} />
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {list.length > 1 && (
        <section className="container-page pb-20">
          <h2 className="display text-2xl sm:text-3xl">{t('compare.title')}</h2>
          <div className="mt-8 overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">{t('compare.title')}</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="border-b border-border px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted"
                  />
                  {list.map((p) => (
                    <th key={p.id} scope="col" className="border-b border-border px-5 py-4 text-left font-semibold">
                      {pickLocale(p.name, locale)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="even:bg-surface-2/40">
                    <th scope="row" className="border-b border-border px-5 py-3.5 text-left font-medium text-muted">
                      {row.label}
                    </th>
                    {list.map((p) => (
                      <td key={p.id} className="border-b border-border px-5 py-3.5">
                        {row.value(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted">{t('compare.note')}</p>
        </section>
      )}

      {faq && faq.some((q) => q.category === 'membership' || q.category === 'payments') && (
        <section className="border-t border-border py-20">
          <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <h2 className="display text-2xl sm:text-3xl">{t('faqTitle')}</h2>
            <div className="divide-y divide-border border-y border-border">
              {faq
                .filter((q) => q.category === 'membership' || q.category === 'payments')
                .map((q) => (
                  <details key={q.id} className="group py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-medium [&::-webkit-details-marker]:hidden">
                      {pickLocale(q.question, locale)}
                      <Plus className="size-5 shrink-0 text-muted transition-transform group-open:rotate-45" />
                    </summary>
                    <p className="mt-3 text-muted">{pickLocale(q.answer, locale)}</p>
                  </details>
                ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
