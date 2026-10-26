import { getTranslations } from 'next-intl/server';
import { ArrowUpRight, Check, Clock } from 'lucide-react';
import { formatKzt, pickLocale, type Locale, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import type { Plan } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CmsImage } from './content';

export async function PlanCard({ plan, locale, compact }: { plan: Plan; locale: Locale; compact?: boolean }) {
  const t = await getTranslations('plans');
  const perMonth = plan.durationDays >= 60 ? Math.round((plan.price / plan.durationDays) * 30) : null;
  return (
    <article
      className={cn(
        'group relative flex h-full flex-col rounded-xl border p-7 transition-[border,transform,box-shadow] duration-300 hover:-translate-y-1',
        plan.isFeatured
          ? 'border-ink bg-ink text-bone shadow-2xl dark:border-primary'
          : 'border-border bg-surface hover:border-border-strong hover:shadow-lg',
      )}
    >
      {plan.isFeatured && (
        <Badge tone="primary" className="absolute right-6 top-6 bg-ember text-white">
          {t('popular')}
        </Badge>
      )}
      <p className={cn('eyebrow', plan.isFeatured ? 'text-bone/50' : 'text-muted')}>{t(`types.${plan.type}`)}</p>
      <h3 className="mt-3 font-display text-2xl font-semibold">{pickLocale(plan.name, locale)}</h3>
      <p className={cn('mt-2 min-h-10 text-sm', plan.isFeatured ? 'text-bone/65' : 'text-muted')}>
        {pickLocale(plan.description, locale)}
      </p>
      <div className="mt-6 flex items-baseline gap-2">
        <span className="font-display text-[2.2rem] font-semibold tracking-tight">
          {plan.price === 0 ? t('free') : formatKzt(plan.price, locale)}
        </span>
      </div>
      <p className={cn('mt-1 text-xs', plan.isFeatured ? 'text-bone/55' : 'text-muted')}>
        {t('duration', { days: plan.durationDays })}
        {plan.visitLimit ? ` · ${t('visits', { count: plan.visitLimit })}` : ` · ${t('unlimitedVisits')}`}
        {perMonth ? ` · ≈ ${formatKzt(perMonth, locale)} ${t('perMonth')}` : ''}
      </p>
      {!compact && (
        <ul className="mt-6 flex-1 space-y-2.5 text-sm">
          {(plan.features as LocalizedText[]).map((f, i) => (
            <li key={i} className="flex gap-2.5">
              <Check className={cn('mt-0.5 size-4 shrink-0', plan.isFeatured ? 'text-ember' : 'text-primary')} />
              <span>{pickLocale(f, locale)}</span>
            </li>
          ))}
        </ul>
      )}
      <Button
        asChild
        size="lg"
        variant={plan.isFeatured ? 'primary' : 'outline'}
        className={cn('mt-8 w-full', !plan.isFeatured && 'group-hover:border-foreground')}
      >
        <Link href={`/memberships/checkout?plan=${plan.id}`}>
          {plan.requiresStudentId ? t('requestStudent') : t('choose')}
        </Link>
      </Button>
    </article>
  );
}

export interface ClassTypeCardData {
  id: string;
  slug: string;
  name: LocalizedText;
  summary: LocalizedText;
  difficulty: string;
  durationMinutes: number;
  intensity: number;
  imageUrl: string | null;
  category: { name: LocalizedText };
}

export async function ClassCard({ item, locale }: { item: ClassTypeCardData; locale: Locale }) {
  const t = await getTranslations('classes');
  const common = await getTranslations('common');
  return (
    <Link href={`/classes/${item.slug}`} className="group block">
      <CmsImage
        url={item.imageUrl}
        alt={pickLocale(item.name, locale)}
        locale={locale}
        demoLabel={common('demoPhoto')}
        className="aspect-[4/5] rounded-xl"
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      />
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-muted">{pickLocale(item.category.name, locale)}</p>
          <h3 className="mt-1.5 text-lg font-semibold">{pickLocale(item.name, locale)}</h3>
          <p className="mt-1 flex items-center gap-3 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {t('minutes', { count: item.durationMinutes })}
            </span>
            <span>{t(`difficulty.${item.difficulty}`)}</span>
            <IntensityDots value={item.intensity} label={t('intensity')} />
          </p>
        </div>
        <ArrowUpRight className="mt-1 size-5 shrink-0 text-muted transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
    </Link>
  );
}

export function IntensityDots({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label}: ${value}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={cn('h-2.5 w-1 rounded-full', i < value ? 'bg-primary' : 'bg-border-strong')} />
      ))}
    </span>
  );
}

export async function TrainerCard({
  trainer,
  locale,
}: {
  trainer: {
    slug: string;
    displayName: string;
    headline: LocalizedText;
    photoUrl: string | null;
    specializations: string[];
  };
  locale: Locale;
}) {
  const common = await getTranslations('common');
  return (
    <Link href={`/trainers/${trainer.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-xl">
        <CmsImage
          url={trainer.photoUrl}
          alt={trainer.displayName}
          locale={locale}
          demoLabel={common('demoPhoto')}
          className="aspect-[3/4] transition-transform duration-700 group-hover:scale-[1.03]"
          sizes="(min-width: 1024px) 25vw, 50vw"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent p-5 pt-16 text-bone">
          <p className="text-lg font-semibold">{trainer.displayName}</p>
          <p className="text-sm text-bone/70">{pickLocale(trainer.headline, locale)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {trainer.specializations.slice(0, 3).map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
      </div>
    </Link>
  );
}
