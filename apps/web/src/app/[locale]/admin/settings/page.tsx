'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CircleAlert, Mail } from 'lucide-react';
import type { ClubSettings } from '@fitclub/shared';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Badge, Card, CardHeader, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { Field } from '@/components/ui/form';
import { AdminPage, issuesToMap, LocalizedField, useAdminMutation } from '@/components/admin/kit';

interface SettingsResponse {
  settings: ClubSettings;
  integrations: {
    email: { configured: boolean; provider: string; from: string };
    payments: { online: string; sandbox: boolean; liveProviderConfigured: boolean };
  };
}

export default function SettingsPage() {
  const t = useTranslations('admin.settings');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<SettingsResponse>('/admin/settings'),
  });
  return (
    <AdminPage title={t('title')} description={t('lead')}>
      {isLoading || !data ? <Skeleton className="h-96" /> : <SettingsForm initial={data} />}
    </AdminPage>
  );
}

function SettingsForm({ initial }: { initial: SettingsResponse }) {
  const t = useTranslations('admin.settings');
  const [s, setS] = useState<ClubSettings>(initial.settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminMutation(() => api.put('/admin/settings', s), {
    invalidate: [['admin-settings'], ['public-settings']],
    revalidateSite: true,
    success: t('saved'),
    onError: (e) => {
      const map = issuesToMap(e);
      setErrors(map);
      return Object.keys(map).length > 0;
    },
  });
  const num = (v: string) => Number(v || 0);
  const section = <K extends keyof ClubSettings>(key: K, patch: Partial<ClubSettings[K]>) =>
    setS({ ...s, [key]: { ...(s[key] as object), ...patch } });

  return (
    <>
      <Tabs defaultValue="club">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="club">{t('tabs.club')}</TabsTrigger>
            <TabsTrigger value="booking">{t('tabs.booking')}</TabsTrigger>
            <TabsTrigger value="membership">{t('tabs.membership')}</TabsTrigger>
            <TabsTrigger value="notifications">{t('tabs.notifications')}</TabsTrigger>
            <TabsTrigger value="security">{t('tabs.security')}</TabsTrigger>
            <TabsTrigger value="integrations">{t('tabs.integrations')}</TabsTrigger>
          </TabsList>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            {t('save')}
          </Button>
        </div>
        <TabsContent value="club">
          <Card className="grid gap-5 p-6 md:grid-cols-2">
            <Field label={t('name')} error={errors.name}>
              {(p) => <Input {...p} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />}
            </Field>
            <Field label={t('legalName')}>
              {(p) => <Input {...p} value={s.legalName} onChange={(e) => setS({ ...s, legalName: e.target.value })} />}
            </Field>
            <div className="md:col-span-2">
              <LocalizedField label={t('tagline')} value={s.tagline} onChange={(tagline) => setS({ ...s, tagline })} />
            </div>
            <Field label={t('phone')}>
              {(p) => (
                <Input {...p} value={s.contact.phone} onChange={(e) => section('contact', { phone: e.target.value })} />
              )}
            </Field>
            <Field label="E-mail">
              {(p) => (
                <Input {...p} value={s.contact.email} onChange={(e) => section('contact', { email: e.target.value })} />
              )}
            </Field>
            <Field label="WhatsApp">
              {(p) => (
                <Input
                  {...p}
                  value={s.contact.whatsapp}
                  onChange={(e) => section('contact', { whatsapp: e.target.value })}
                />
              )}
            </Field>
            <Field label="Instagram">
              {(p) => (
                <Input
                  {...p}
                  value={s.contact.instagram}
                  onChange={(e) => section('contact', { instagram: e.target.value })}
                />
              )}
            </Field>
            <Field label="Telegram">
              {(p) => (
                <Input
                  {...p}
                  value={s.contact.telegram}
                  onChange={(e) => section('contact', { telegram: e.target.value })}
                />
              )}
            </Field>
            <Field label={t('accent')} error={errors.branding} hint={t('accentHint')}>
              {(p) => (
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label={t('accent')}
                    value={s.branding.accentColor}
                    onChange={(e) => section('branding', { accentColor: e.target.value.toUpperCase() })}
                    className="h-10 w-12 rounded border border-border"
                  />
                  <Input
                    {...p}
                    value={s.branding.accentColor}
                    onChange={(e) => section('branding', { accentColor: e.target.value })}
                  />
                </div>
              )}
            </Field>
            <Field label={t('defaultLocale')}>
              {(p) => (
                <Select
                  {...p}
                  value={s.localization.defaultLocale}
                  onChange={(e) =>
                    setS({ ...s, localization: { defaultLocale: e.target.value as 'kk' | 'ru' | 'en' } })
                  }
                >
                  <option value="ru">Русский</option>
                  <option value="kk">Қазақша</option>
                  <option value="en">English</option>
                </Select>
              )}
            </Field>
            <p className="text-xs text-muted md:col-span-2">{t('hoursNote')}</p>
          </Card>
        </TabsContent>
        <TabsContent value="booking">
          <Card className="grid gap-5 p-6 md:grid-cols-3">
            <Field label={t('opensHours')} hint={t('opensHoursHint')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  value={s.bookingPolicy.opensHoursBefore}
                  onChange={(e) => section('bookingPolicy', { opensHoursBefore: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('cutoff')} hint={t('cutoffHint')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  value={s.bookingPolicy.cutoffMinutes}
                  onChange={(e) => section('bookingPolicy', { cutoffMinutes: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('freeCancel')} hint={t('freeCancelHint')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  value={s.bookingPolicy.freeCancellationHours}
                  onChange={(e) => section('bookingPolicy', { freeCancellationHours: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('maxBookings')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  value={s.bookingPolicy.maxActiveBookings}
                  onChange={(e) => section('bookingPolicy', { maxActiveBookings: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('waitlistSize')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  value={s.bookingPolicy.maxWaitlistSize}
                  onChange={(e) => section('bookingPolicy', { maxWaitlistSize: num(e.target.value) })}
                />
              )}
            </Field>
            <label className="flex items-end justify-between gap-3 pb-2 text-sm">
              {t('waitlist')}{' '}
              <Switch
                checked={s.bookingPolicy.waitlistEnabled}
                onCheckedChange={(v) => section('bookingPolicy', { waitlistEnabled: v })}
              />
            </label>
          </Card>
        </TabsContent>
        <TabsContent value="membership">
          <Card className="grid gap-5 p-6 md:grid-cols-3">
            <Field label={t('minFreeze')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  value={s.membershipPolicy.minFreezeDays}
                  onChange={(e) => section('membershipPolicy', { minFreezeDays: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('freezeAdvance')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  value={s.membershipPolicy.maxFreezeAdvanceDays}
                  onChange={(e) => section('membershipPolicy', { maxFreezeAdvanceDays: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('reminders')} hint={t('remindersHint')}>
              {(p) => (
                <Input
                  {...p}
                  value={s.membershipPolicy.expiryReminderDays.join(', ')}
                  onChange={(e) =>
                    section('membershipPolicy', {
                      expiryReminderDays: e.target.value
                        .split(',')
                        .map((x) => Number(x.trim()))
                        .filter((x) => Number.isInteger(x) && x > 0)
                        .slice(0, 5),
                    })
                  }
                />
              )}
            </Field>
            <label className="flex items-center justify-between gap-3 text-sm md:col-span-3">
              {t('selfFreeze')}{' '}
              <Switch
                checked={s.membershipPolicy.memberSelfFreeze}
                onCheckedChange={(v) => section('membershipPolicy', { memberSelfFreeze: v })}
              />
            </label>
            <p className="text-xs text-muted md:col-span-3">{t('planRulesNote')}</p>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card className="grid gap-5 p-6 md:grid-cols-2">
            <Field label={t('classReminder')} hint={t('classReminderHint')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  value={s.notifications.classReminderHours}
                  onChange={(e) => section('notifications', { classReminderHours: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('alertEmail')}>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  value={s.notifications.adminAlertEmail}
                  onChange={(e) => section('notifications', { adminAlertEmail: e.target.value })}
                />
              )}
            </Field>
          </Card>
          <EmailOutbox />
        </TabsContent>
        <TabsContent value="security">
          <Card className="grid gap-5 p-6 md:grid-cols-3">
            <Field label={t('sessionTtl')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  value={s.security.sessionTtlDays}
                  onChange={(e) => section('security', { sessionTtlDays: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('maxFailed')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={3}
                  value={s.security.maxFailedLogins}
                  onChange={(e) => section('security', { maxFailedLogins: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label={t('lockout')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  value={s.security.lockoutMinutes}
                  onChange={(e) => section('security', { lockoutMinutes: num(e.target.value) })}
                />
              )}
            </Field>
            <ul className="space-y-1 text-xs text-muted md:col-span-3">
              <li>• {t('sec1')}</li>
              <li>• {t('sec2')}</li>
              <li>• {t('sec3')}</li>
            </ul>
          </Card>
        </TabsContent>
        <TabsContent value="integrations">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <p className="flex items-center gap-2 font-semibold">
                {initial.integrations.email.configured ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <CircleAlert className="size-5 text-warning" />
                )}
                {t('email')}
              </p>
              <p className="mt-2 text-sm text-muted">
                {initial.integrations.email.configured
                  ? t('emailOn', { from: initial.integrations.email.from })
                  : t('emailOff')}
              </p>
            </Card>
            <Card className="p-6">
              <p className="flex items-center gap-2 font-semibold">
                {initial.integrations.payments.liveProviderConfigured ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <CircleAlert className="size-5 text-warning" />
                )}
                {t('payments')}
              </p>
              <p className="mt-2 text-sm text-muted">
                {initial.integrations.payments.sandbox ? t('paymentsSandbox') : t('paymentsOff')}
              </p>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

function EmailOutbox() {
  const t = useTranslations('admin.settings');
  const fmt = useFmt();
  const { data } = useQuery({
    queryKey: ['email-outbox'],
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          to: string;
          subject: string;
          type: string;
          status: string;
          error: string | null;
          createdAt: string;
        }[];
        byStatus: Record<string, number>;
        delivery: { configured: boolean };
      }>('/admin/emails?pageSize=15'),
  });
  return (
    <Card className="mt-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Mail className="size-4" /> {t('outbox')}
          </span>
        }
        description={
          data
            ? Object.entries(data.byStatus)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')
            : undefined
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>{t('when')}</Th>
            <Th>{t('to')}</Th>
            <Th>{t('subject')}</Th>
            <Th>{t('status')}</Th>
          </tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((m) => (
            <tr key={m.id}>
              <Td className="whitespace-nowrap text-muted">{fmt.relative(m.createdAt)}</Td>
              <Td>{m.to}</Td>
              <Td>{m.subject}</Td>
              <Td>
                <Badge
                  tone={
                    m.status === 'SENT'
                      ? 'success'
                      : m.status === 'FAILED'
                        ? 'danger'
                        : m.status === 'SKIPPED'
                          ? 'warning'
                          : 'neutral'
                  }
                  title={m.error ?? undefined}
                >
                  {m.status}
                </Badge>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
