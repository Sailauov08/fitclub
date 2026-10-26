'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';
import { registerSchema, type Locale, type LocalizedText } from '@fitclub/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import type { Me } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/controls';
import { Field, useFormErrorHandler } from '@/components/ui/form';

const schema = registerSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: 'v.passwordMismatch', path: ['confirmPassword'] });

export function RegisterForm() {
  const t = useTranslations('auth');
  const locale = useLocale() as Locale;
  const fmt = useFmt();
  const router = useRouter();
  const qc = useQueryClient();
  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<{ id: string; name: LocalizedText }[]>('/branches'),
  });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      phone: '',
      locale,
      marketingOptIn: false,
      acceptTerms: undefined as unknown as true,
    },
  });
  const acceptTerms = useWatch({ control: form.control, name: 'acceptTerms' });
  const marketingOptIn = useWatch({ control: form.control, name: 'marketingOptIn' });
  const onError = useFormErrorHandler(form.setError);
  const e = form.formState.errors;

  const submit = form.handleSubmit(async ({ confirmPassword: _c, ...values }) => {
    try {
      await api.post('/auth/register', values);
      qc.setQueryData(['me'], await api.get<Me>('/auth/me'));
      router.replace('/account?welcome=1');
      router.refresh();
    } catch (err) {
      onError(err);
    }
  });

  return (
    <>
      <h1 className="display text-3xl">{t('registerTitle')}</h1>
      <p className="mt-2 text-muted">{t('registerLead')}</p>
      <form onSubmit={submit} noValidate className="mt-8 grid gap-5 sm:grid-cols-2">
        <Field label={t('firstName')} error={e.firstName} required>
          {(p) => <Input {...p} {...form.register('firstName')} autoComplete="given-name" />}
        </Field>
        <Field label={t('lastName')} error={e.lastName} required>
          {(p) => <Input {...p} {...form.register('lastName')} autoComplete="family-name" />}
        </Field>
        <Field label={t('email')} error={e.email} required className="sm:col-span-2">
          {(p) => <Input {...p} {...form.register('email')} type="email" autoComplete="email" />}
        </Field>
        <Field label={t('phone')} error={e.phone} hint={t('phoneHint')} required className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              {...form.register('phone')}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+7 7__ ___ __ __"
            />
          )}
        </Field>
        <Field label={t('password')} error={e.password} hint={t('passwordHint')} required>
          {(p) => <Input {...p} {...form.register('password')} type="password" autoComplete="new-password" />}
        </Field>
        <Field label={t('confirmPassword')} error={e.confirmPassword} required>
          {(p) => <Input {...p} {...form.register('confirmPassword')} type="password" autoComplete="new-password" />}
        </Field>
        <Field label={t('homeBranch')} error={e.homeBranchId} className="sm:col-span-2">
          {(p) => (
            <Select {...p} {...form.register('homeBranchId', { setValueAs: (v) => (v ? v : undefined) })}>
              <option value="">{t('anyBranch')}</option>
              {(branches.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {fmt.t(b.name)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="space-y-3 sm:col-span-2">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={acceptTerms === true}
              onCheckedChange={(v) =>
                form.setValue('acceptTerms', (v === true) as true, { shouldValidate: form.formState.isSubmitted })
              }
              aria-invalid={e.acceptTerms ? true : undefined}
            />
            <span className="text-muted">
              {t.rich('acceptTerms', {
                terms: (c) => (
                  <Link href="/terms" className="underline underline-offset-2" target="_blank">
                    {c}
                  </Link>
                ),
                privacy: (c) => (
                  <Link href="/privacy" className="underline underline-offset-2" target="_blank">
                    {c}
                  </Link>
                ),
              })}
            </span>
          </label>
          {e.acceptTerms && <p className="text-xs font-medium text-danger">{t('acceptRequired')}</p>}
          <label className="flex items-start gap-3 text-sm text-muted">
            <Checkbox
              checked={marketingOptIn === true}
              onCheckedChange={(v) => form.setValue('marketingOptIn', v === true)}
            />
            {t('marketing')}
          </label>
        </div>
        <Button type="submit" size="lg" className="w-full sm:col-span-2" loading={form.formState.isSubmitting}>
          {t('registerSubmit')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-semibold text-foreground hover:text-primary">
          {t('loginLink')}
        </Link>
      </p>
    </>
  );
}
