'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { pickLocale, publicLeadSchema, type Locale, type LocalizedText } from '@fitclub/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/controls';
import { Field, useFormErrorHandler } from '@/components/ui/form';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

type Values = z.input<typeof publicLeadSchema>;

/** Website enquiry / trial request. Creates a CRM lead; a hidden honeypot field filters simple bots. */
export function LeadForm({
  source,
  branches,
  interest,
  inverse,
  className,
}: {
  source: 'WEBSITE_CONTACT' | 'TRIAL_REQUEST';
  branches: { id: string; name: LocalizedText }[];
  interest?: string;
  inverse?: boolean;
  className?: string;
}) {
  const t = useTranslations('leadForm');
  const locale = useLocale() as Locale;
  const [sent, setSent] = useState(false);
  const form = useForm<Values, unknown, z.output<typeof publicLeadSchema>>({
    resolver: zodResolver(publicLeadSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      message: '',
      source,
      interest,
      consent: undefined as unknown as true,
      website: '',
    },
  });
  const consent = useWatch({ control: form.control, name: 'consent' });
  const onError = useFormErrorHandler(form.setError);

  const submit = form.handleSubmit(async (values) => {
    try {
      await api.post('/leads', values);
      setSent(true);
      form.reset();
    } catch (error) {
      onError(error);
    }
  });

  if (sent) {
    return (
      <div
        role="status"
        className={cn(
          'flex flex-col items-start gap-3 rounded-xl border p-8',
          inverse ? 'border-white/15 bg-white/5 text-bone' : 'border-border bg-surface',
          className,
        )}
      >
        <CheckCircle2 className="size-8 text-success" />
        <p className="text-lg font-semibold">{t('successTitle')}</p>
        <p className={cn('text-sm', inverse ? 'text-bone/70' : 'text-muted')}>{t('successBody')}</p>
        <Button variant={inverse ? 'inverse-outline' : 'outline'} size="sm" onClick={() => setSent(false)}>
          {t('again')}
        </Button>
      </div>
    );
  }

  const inputClass = inverse ? 'border-white/20 bg-white/5 text-bone placeholder:text-bone/40' : undefined;
  return (
    <form
      onSubmit={submit}
      noValidate
      className={cn('relative grid gap-4 sm:grid-cols-2', inverse && '[&_label]:text-bone/85', className)}
    >
      <Field label={t('name')} error={form.formState.errors.name} required className="sm:col-span-2">
        {(p) => <Input {...p} {...form.register('name')} autoComplete="name" className={inputClass} />}
      </Field>
      <Field label={t('phone')} error={form.formState.errors.phone} hint={t('phoneHint')}>
        {(p) => (
          <Input
            {...p}
            {...form.register('phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 7__ ___ __ __"
            className={inputClass}
          />
        )}
      </Field>
      <Field label={t('email')} error={form.formState.errors.email}>
        {(p) => <Input {...p} {...form.register('email')} type="email" autoComplete="email" className={inputClass} />}
      </Field>
      {branches.length > 0 && (
        <Field label={t('branch')} error={form.formState.errors.branchId}>
          {(p) => (
            <Select
              {...p}
              {...form.register('branchId', { setValueAs: (v) => (v ? v : undefined) })}
              className={inputClass}
            >
              <option value="">{t('anyBranch')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {pickLocale(b.name, locale)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {source === 'TRIAL_REQUEST' && (
        <Field label={t('preferredDate')} error={form.formState.errors.preferredDate}>
          {(p) => (
            <Input
              {...p}
              {...form.register('preferredDate', { setValueAs: (v) => (v ? v : undefined) })}
              type="date"
              className={inputClass}
            />
          )}
        </Field>
      )}
      <Field label={t('message')} error={form.formState.errors.message} className="sm:col-span-2">
        {(p) => <Textarea {...p} {...form.register('message')} rows={3} className={inputClass} />}
      </Field>
      {/* Honeypot: invisible to people, filled in by naive bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" {...form.register('website')} />
        </label>
      </div>
      <div className="sm:col-span-2">
        <label className={cn('flex items-start gap-3 text-sm', inverse ? 'text-bone/75' : 'text-muted')}>
          <Checkbox
            checked={consent === true}
            onCheckedChange={(v) =>
              form.setValue('consent', (v === true) as true, { shouldValidate: form.formState.isSubmitted })
            }
            aria-invalid={form.formState.errors.consent ? true : undefined}
            className={inverse ? 'border-white/30 bg-transparent' : undefined}
          />
          <span>
            {t.rich('consent', {
              link: (chunks) => (
                <Link href="/privacy" className="underline underline-offset-2">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        {form.formState.errors.consent && (
          <p className="mt-1.5 text-xs font-medium text-danger">{t('consentRequired')}</p>
        )}
      </div>
      <div className="sm:col-span-2">
        <Button
          type="submit"
          size="lg"
          loading={form.formState.isSubmitting}
          variant={inverse ? 'primary' : 'primary'}
          className="w-full sm:w-auto"
        >
          {source === 'TRIAL_REQUEST' ? t('submitTrial') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
