'use client';

import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Camera, Laptop, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  changePasswordSchema,
  LOCALES,
  NOTIFICATION_CATEGORIES,
  updateProfileSchema,
  type NotificationPrefs,
} from '@fitclub/shared';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Avatar, Switch } from '@/components/ui/controls';
import { Card, CardHeader, Skeleton } from '@/components/ui/display';
import { Field, useFormErrorHandler } from '@/components/ui/form';
import { useErrorMessage } from '@/components/providers';
import { PageTitle } from '@/components/account/shell';

const LANG_NAMES = { kk: 'Қазақша', ru: 'Русский', en: 'English' } as const;

export default function ProfilePage() {
  const t = useTranslations('account.profile');
  const { data: me, isLoading } = useMe();
  if (isLoading || !me) return <Skeleton className="h-96" />;
  return (
    <>
      <PageTitle title={t('title')} description={t('lead')} />
      <div className="space-y-6">
        <ProfileForm />
        <NotificationPreferences initial={me.notificationPrefs} />
        <PasswordForm />
        <Sessions />
      </div>
    </>
  );
}

function ProfileForm() {
  const t = useTranslations('account.profile');
  const { data: me } = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const message = useErrorMessage();
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<z.input<typeof updateProfileSchema>, unknown, z.output<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      firstName: me?.profile?.firstName ?? '',
      lastName: me?.profile?.lastName ?? '',
      phone: me?.profile?.phone ?? '',
      locale: me?.locale ?? 'ru',
      birthDate: me?.profile?.birthDate ? me.profile.birthDate.slice(0, 10) : null,
    },
  });
  const onError = useFormErrorHandler(form.setError);
  const submit = form.handleSubmit(async (values) => {
    try {
      await api.patch('/me/profile', values);
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('saved'));
      if (values.locale !== me?.locale) router.replace('/account/profile', { locale: values.locale });
    } catch (e) {
      onError(e);
    }
  });
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      await api.upload('/me/avatar', file);
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.refresh();
      toast.success(t('avatarUpdated'));
    } catch (e) {
      toast.error(message(e));
    }
  };
  const name = `${me?.profile?.firstName ?? ''} ${me?.profile?.lastName ?? ''}`;
  return (
    <Card>
      <CardHeader title={t('personal')} description={me?.email} />
      <form onSubmit={submit} noValidate className="grid gap-5 p-5 sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">
          <Avatar src={me?.profile?.avatarUrl} name={name} className="size-16" />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Camera /> {t('changePhoto')}
          </Button>
          <p className="text-xs text-muted">{t('photoHint')}</p>
        </div>
        <Field label={t('firstName')} error={form.formState.errors.firstName}>
          {(p) => <Input {...p} {...form.register('firstName')} autoComplete="given-name" />}
        </Field>
        <Field label={t('lastName')} error={form.formState.errors.lastName}>
          {(p) => <Input {...p} {...form.register('lastName')} autoComplete="family-name" />}
        </Field>
        <Field label={t('phone')} error={form.formState.errors.phone}>
          {(p) => <Input {...p} {...form.register('phone')} type="tel" autoComplete="tel" />}
        </Field>
        <Field label={t('birthDate')} hint={t('birthHint')} error={form.formState.errors.birthDate}>
          {(p) => <Input {...p} type="date" {...form.register('birthDate', { setValueAs: (v) => (v ? v : null) })} />}
        </Field>
        <Field label={t('language')}>
          {(p) => (
            <Select {...p} {...form.register('locale')}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LANG_NAMES[l]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex items-end justify-end sm:col-span-2">
          <Button type="submit" loading={form.formState.isSubmitting}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function NotificationPreferences({ initial }: { initial: NotificationPrefs }) {
  const t = useTranslations('account.profile');
  const message = useErrorMessage();
  const [prefs, setPrefs] = useState(initial);
  const save = useMutation({
    mutationFn: (next: NotificationPrefs) => api.put('/me/notification-preferences', next),
    onSuccess: () => toast.success(t('saved')),
    onError: (e) => toast.error(message(e)),
  });
  const toggle = (cat: (typeof NOTIFICATION_CATEGORIES)[number], channel: 'inApp' | 'email', value: boolean) => {
    const next = { ...prefs, [cat]: { ...prefs[cat], [channel]: value } };
    setPrefs(next);
    save.mutate(next);
  };
  return (
    <Card>
      <CardHeader title={t('notifications')} description={t('notificationsLead')} />
      <div className="overflow-x-auto p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th className="pb-3 font-semibold" />
              <th className="pb-3 font-semibold">{t('inApp')}</th>
              <th className="pb-3 font-semibold">E-mail</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_CATEGORIES.map((cat) => (
              <tr key={cat} className="border-t border-border">
                <td className="py-3 pr-4">
                  <p className="font-medium">{t(`categories.${cat}.title`)}</p>
                  <p className="text-xs text-muted">{t(`categories.${cat}.body`)}</p>
                </td>
                <td className="py-3">
                  <Switch
                    checked={prefs[cat].inApp}
                    onCheckedChange={(v) => toggle(cat, 'inApp', v)}
                    aria-label={`${t(`categories.${cat}.title`)} — ${t('inApp')}`}
                  />
                </td>
                <td className="py-3">
                  <Switch
                    checked={prefs[cat].email}
                    onCheckedChange={(v) => toggle(cat, 'email', v)}
                    aria-label={`${t(`categories.${cat}.title`)} — e-mail`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">{t('securityEmails')}</p>
      </div>
    </Card>
  );
}

const passwordForm = changePasswordSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { message: 'v.passwordMismatch', path: ['confirm'] });

function PasswordForm() {
  const t = useTranslations('account.profile');
  const form = useForm<z.input<typeof passwordForm>, unknown, z.output<typeof passwordForm>>({
    resolver: zodResolver(passwordForm),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const onError = useFormErrorHandler(form.setError);
  const submit = form.handleSubmit(async ({ confirm: _c, ...values }) => {
    try {
      await api.post('/auth/change-password', values);
      toast.success(t('passwordChanged'));
      form.reset();
    } catch (e) {
      onError(e);
    }
  });
  return (
    <Card>
      <CardHeader title={t('password')} description={t('passwordLead')} />
      <form onSubmit={submit} noValidate className="grid gap-5 p-5 sm:grid-cols-3">
        <Field label={t('currentPassword')} error={form.formState.errors.currentPassword}>
          {(p) => (
            <Input {...p} {...form.register('currentPassword')} type="password" autoComplete="current-password" />
          )}
        </Field>
        <Field label={t('newPassword')} error={form.formState.errors.newPassword}>
          {(p) => <Input {...p} {...form.register('newPassword')} type="password" autoComplete="new-password" />}
        </Field>
        <Field label={t('confirmPassword')} error={form.formState.errors.confirm}>
          {(p) => <Input {...p} {...form.register('confirm')} type="password" autoComplete="new-password" />}
        </Field>
        <div className="flex justify-end sm:col-span-3">
          <Button type="submit" loading={form.formState.isSubmitting}>
            {t('changePassword')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Sessions() {
  const t = useTranslations('account.profile');
  const fmt = useFmt();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['sessions-list'],
    queryFn: () =>
      api.get<{ id: string; createdAt: string; lastUsedAt: string; userAgent: string | null; current: boolean }[]>(
        '/auth/sessions',
      ),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions-list'] }),
  });
  return (
    <Card>
      <CardHeader title={t('devices')} description={t('devicesLead')} />
      <ul className="divide-y divide-border">
        {(data ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-4 px-5 py-3.5 text-sm">
            <Laptop className="size-5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.userAgent?.slice(0, 80) ?? t('unknownDevice')}</p>
              <p className="text-xs text-muted">{t('lastActive', { when: fmt.relative(s.lastUsedAt) })}</p>
            </div>
            {s.current ? (
              <span className="text-xs font-semibold text-success">{t('thisDevice')}</span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>
                <LogOut /> {t('signOut')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
