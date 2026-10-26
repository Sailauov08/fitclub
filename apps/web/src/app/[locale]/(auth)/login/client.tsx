'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { loginSchema } from '@fitclub/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/form';
import { useErrorMessage } from '@/components/providers';

/** Only same-site relative paths are accepted as post-login redirects (prevents open redirects). */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  return next.replace(/^\/(kk|ru|en)(?=\/|$)/, '') || '/';
}

export function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const message = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const form = useForm<z.input<typeof loginSchema>, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/auth/login', values);
      const me = await api.get<Me>('/auth/me');
      qc.setQueryData(['me'], me);
      router.replace(safeNext(params.get('next')) ?? (me.staff ? '/admin' : '/account'));
      router.refresh();
    } catch (e) {
      setError(message(e));
    }
  });

  return (
    <>
      <h1 className="display text-3xl">{t('loginTitle')}</h1>
      <p className="mt-2 text-muted">{t('loginLead')}</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        <Field label={t('email')} error={form.formState.errors.email}>
          {(p) => <Input {...p} {...form.register('email')} type="email" autoComplete="email" autoFocus />}
        </Field>
        <Field label={t('password')} error={form.formState.errors.password}>
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                {...form.register('password')}
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-foreground"
                aria-label={show ? t('hidePassword') : t('showPassword')}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            {t('forgot')}
          </Link>
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {t('loginSubmit')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-semibold text-foreground hover:text-primary">
          {t('registerLink')}
        </Link>
      </p>
    </>
  );
}
