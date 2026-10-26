'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react';
import { z } from 'zod';
import { forgotPasswordSchema, passwordSchema } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/display';
import { Field, useFormErrorHandler } from '@/components/ui/form';
import { useErrorMessage } from '@/components/providers';

export function ForgotForm() {
  const t = useTranslations('auth');
  const [sent, setSent] = useState(false);
  const form = useForm<z.input<typeof forgotPasswordSchema>, unknown, z.output<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const onError = useFormErrorHandler(form.setError);
  const submit = form.handleSubmit(async (v) => {
    try {
      await api.post('/auth/forgot-password', v);
      setSent(true);
    } catch (e) {
      onError(e);
    }
  });
  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-12 text-success" />
        <h1 className="display mt-6 text-2xl">{t('forgotSentTitle')}</h1>
        <p className="mt-3 text-muted">{t('forgotSentBody')}</p>
        <Button asChild variant="outline" className="mt-8">
          <Link href="/login">{t('backToLogin')}</Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <h1 className="display text-3xl">{t('forgotTitle')}</h1>
      <p className="mt-2 text-muted">{t('forgotLead')}</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        <Field label={t('email')} error={form.formState.errors.email}>
          {(p) => <Input {...p} {...form.register('email')} type="email" autoComplete="email" autoFocus />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {t('forgotSubmit')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm">
        <Link href="/login" className="font-medium text-muted hover:text-foreground">
          ← {t('backToLogin')}
        </Link>
      </p>
    </>
  );
}

const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: 'v.passwordMismatch', path: ['confirmPassword'] });

/** Handles password reset, member invitations and staff invitations (all single-use links). */
export function ResetForm() {
  const t = useTranslations('auth');
  const message = useErrorMessage();
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const info = useQuery({
    queryKey: ['token-info', token],
    queryFn: () =>
      api.get<{ type: 'PASSWORD_RESET' | 'MEMBER_INVITE' | 'STAFF_INVITE'; email: string; role: string | null }>(
        `/auth/token-info?token=${encodeURIComponent(token)}`,
      ),
    enabled: token.length >= 20,
    retry: false,
  });
  const form = useForm<z.input<typeof resetSchema>, unknown, z.output<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const onError = useFormErrorHandler(form.setError);
  const submit = form.handleSubmit(async (v) => {
    try {
      await api.post('/auth/reset-password', { token, password: v.password });
      setDone(true);
    } catch (e) {
      onError(e);
    }
  });

  if (token.length < 20 || info.isError) {
    return (
      <div className="text-center">
        <XCircle className="mx-auto size-12 text-danger" />
        <h1 className="display mt-6 text-2xl">{t('linkInvalid')}</h1>
        <p className="mt-3 text-muted">{info.error ? message(info.error) : t('linkInvalidBody')}</p>
        <Button asChild className="mt-8">
          <Link href="/forgot-password">{t('requestNewLink')}</Link>
        </Button>
      </div>
    );
  }
  if (info.isLoading || !info.data) return <Skeleton className="h-72" />;
  if (done) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <h1 className="display mt-6 text-2xl">{t('passwordSetTitle')}</h1>
        <p className="mt-3 text-muted">{t('passwordSetBody')}</p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/login">{t('loginSubmit')}</Link>
        </Button>
      </div>
    );
  }
  const kind = info.data.type;
  return (
    <>
      <h1 className="display text-3xl">{kind === 'PASSWORD_RESET' ? t('resetTitle') : t('inviteTitle')}</h1>
      <p className="mt-2 text-muted">
        {kind === 'STAFF_INVITE'
          ? t('staffInviteLead', { role: info.data.role ?? '' })
          : kind === 'MEMBER_INVITE'
            ? t('memberInviteLead')
            : t('resetLead')}
      </p>
      <p className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-sm">{info.data.email}</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        <Field label={t('newPassword')} error={form.formState.errors.password} hint={t('passwordHint')}>
          {(p) => <Input {...p} {...form.register('password')} type="password" autoComplete="new-password" autoFocus />}
        </Field>
        <Field label={t('confirmPassword')} error={form.formState.errors.confirmPassword}>
          {(p) => <Input {...p} {...form.register('confirmPassword')} type="password" autoComplete="new-password" />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {t('setPassword')}
        </Button>
      </form>
    </>
  );
}

export function VerifyEmail() {
  const t = useTranslations('auth');
  const message = useErrorMessage();
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [error, setError] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .post('/auth/verify-email', { token })
      .then(() => setState('ok'))
      .catch((e) => {
        setError(message(e));
        setState('error');
      });
  }, [token, message]);
  if (state === 'pending') return <Skeleton className="h-48" />;
  return (
    <div className="text-center">
      {state === 'ok' ? (
        <CheckCircle2 className="mx-auto size-12 text-success" />
      ) : (
        <XCircle className="mx-auto size-12 text-danger" />
      )}
      <h1 className="display mt-6 text-2xl">{state === 'ok' ? t('verifiedTitle') : t('linkInvalid')}</h1>
      <p className="mt-3 text-muted">{state === 'ok' ? t('verifiedBody') : error}</p>
      <Button asChild className="mt-8">
        <Link href="/account">{t('toAccount')}</Link>
      </Button>
    </div>
  );
}
