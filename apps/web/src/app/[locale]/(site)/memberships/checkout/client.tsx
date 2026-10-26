'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { BadgeCheck, CreditCard, Info, Lock, ShieldCheck, Tag } from 'lucide-react';
import { addDaysToKey, localDateKey } from '@fitclub/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import type { Plan } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/form';
import { useErrorMessage } from '@/components/providers';

interface Quote {
  subtotal: number;
  discount: number;
  total: number;
  promotion: { code: string | null } | null;
}

export function CheckoutPage() {
  const t = useTranslations('checkout');
  const plansT = useTranslations('plans');
  const fmt = useFmt();
  const router = useRouter();
  const params = useSearchParams();
  const planId = params.get('plan');
  const { data: me, isLoading: meLoading } = useMe();
  const errorMessage = useErrorMessage();
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get<Plan[]>('/plans') });
  const plan = useMemo(() => plans.data?.find((p) => p.id === planId), [plans.data, planId]);

  const today = localDateKey(new Date());
  const [startDate, setStartDate] = useState(today);
  const [code, setCode] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!meLoading && me === null)
      router.replace(`/login?next=${encodeURIComponent(`/memberships/checkout?plan=${planId ?? ''}`)}`);
  }, [me, meLoading, planId, router]);

  const applyCode = async () => {
    if (!plan || !code.trim()) return;
    setPromoError(null);
    try {
      setQuote(await api.post<Quote>('/me/memberships/quote', { planId: plan.id, code: code.trim() }));
    } catch (e) {
      setQuote(null);
      setPromoError(errorMessage(e));
    }
  };

  const pay = async () => {
    if (!plan) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ paymentId: string; status: string; redirectUrl: string | null }>(
        '/me/memberships/purchase',
        {
          planId: plan.id,
          promoCode: quote?.promotion?.code ?? undefined,
          startDate,
        },
      );
      if (res.redirectUrl) window.location.assign(res.redirectUrl);
      else router.push(`/checkout/result?payment=${res.paymentId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e : null);
      if (!(e instanceof ApiError)) setError(new ApiError(0, 'INTERNAL_ERROR', errorMessage(e)));
      setSubmitting(false);
    }
  };

  if (plans.isLoading || meLoading || !me) {
    return (
      <div className="container-page grid gap-8 py-16 lg:grid-cols-[1.3fr_1fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="display text-3xl">{t('notFound')}</h1>
        <Button asChild className="mt-8">
          <Link href="/memberships">{t('backToPlans')}</Link>
        </Button>
      </div>
    );
  }

  const total = quote?.total ?? plan.price;
  return (
    <div className="container-page py-12 sm:py-16">
      <Link href="/memberships" className="text-sm text-muted hover:text-foreground">
        ← {t('backToPlans')}
      </Link>
      <h1 className="display mt-6 text-3xl sm:text-4xl">{t('title')}</h1>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-6 sm:p-8">
          <p className="eyebrow text-muted">{plansT(`types.${plan.type}`)}</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">{fmt.t(plan.name)}</h2>
          <p className="mt-2 text-muted">{fmt.t(plan.description)}</p>
          <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
            <li>{plansT('duration', { days: plan.durationDays })}</li>
            <li>{plan.visitLimit ? plansT('visits', { count: plan.visitLimit }) : plansT('unlimitedVisits')}</li>
            <li>{plan.includesClasses ? t('classesIncluded') : t('gymOnly')}</li>
            <li>{plan.allBranches ? t('allBranches') : t('selectedBranches')}</li>
          </ul>

          {plan.requiresStudentId ? (
            <div className="mt-8 flex gap-3 rounded-lg bg-info-soft p-4 text-sm text-info">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>{t('studentInfo')}</p>
            </div>
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <Field label={t('startDate')} hint={t('startHint')}>
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    value={startDate}
                    min={today}
                    max={addDaysToKey(today, 30)}
                    onChange={(e) => setStartDate(e.target.value || today)}
                  />
                )}
              </Field>
              <Field label={t('promoCode')} error={promoError ?? undefined}>
                {(p) => (
                  <div className="flex gap-2">
                    <Input
                      {...p}
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="WELCOME10"
                      autoComplete="off"
                    />
                    <Button type="button" variant="outline" onClick={applyCode} disabled={!code.trim()}>
                      <Tag /> {t('apply')}
                    </Button>
                  </div>
                )}
              </Field>
            </div>
          )}
        </Card>

        <Card className="h-fit p-6 sm:p-8">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t('subtotal')}</dt>
              <dd>{fmt.money(quote?.subtotal ?? plan.price)}</dd>
            </div>
            {quote && quote.discount > 0 && (
              <div className="flex justify-between text-success">
                <dt className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="size-4" /> {quote.promotion?.code}
                </dt>
                <dd>−{fmt.money(quote.discount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-4">
              <dt className="font-semibold">{t('total')}</dt>
              <dd className="font-display text-2xl font-semibold">{total === 0 ? plansT('free') : fmt.money(total)}</dd>
            </div>
          </dl>
          {error && (
            <div role="alert" className="mt-5 rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {errorMessage(error)}
              {error.code === 'MEMBERSHIP_ALREADY_ACTIVE' && (
                <Link href="/account/membership" className="mt-1 block font-semibold underline">
                  {t('goRenew')}
                </Link>
              )}
            </div>
          )}
          {!plan.requiresStudentId && (
            <Button size="lg" className="mt-6 w-full" onClick={pay} loading={submitting}>
              {total === 0 ? <BadgeCheck /> : <CreditCard />}
              {total === 0 ? t('activateFree') : t('pay', { amount: fmt.money(total) })}
            </Button>
          )}
          <ul className="mt-6 space-y-2 text-xs text-muted">
            <li className="flex gap-2">
              <Lock className="size-3.5 shrink-0" /> {t('secureNote')}
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="size-3.5 shrink-0" /> {t('activationNote')}
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted">{t('signedInAs', { email: me.email })}</p>
        </Card>
      </div>
    </div>
  );
}
