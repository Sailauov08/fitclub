'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Camera, CameraOff, CheckCircle2, ScanLine, ShieldAlert, UserSearch, XCircle } from 'lucide-react';
import { localDateKey, type LocalizedText } from '@fitclub/shared';
import { Link } from '@/i18n/navigation';
import { api, ApiError, qs } from '@/lib/api';
import { useCan, useMe } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/controls';
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui/display';
import { useErrorMessage } from '@/components/providers';
import { AdminPage, ConfirmDialog, SearchInput } from '@/components/admin/kit';
import { useBranches } from '@/components/admin/hooks';
import { cn } from '@/lib/utils';

interface Result {
  accepted: boolean;
  reason: string | null;
  checkIn: { id: string; at: string; method: string };
  member: { id: string; memberNumber: number; firstName: string; lastName: string; avatarUrl: string | null };
  membership: { status: string; endsAt: string; planName: LocalizedText | null; remainingVisits: number | null } | null;
}
interface LookupRow {
  id: string;
  memberNumber: number;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  membership: { status: string; endsAt: string; planName: LocalizedText; remainingVisits: number | null } | null;
  eligible: boolean;
  reason: string | null;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
    };
  }
}

export default function ReceptionPage() {
  const t = useTranslations('admin.checkin');
  const reasons = useTranslations('reasons');
  const fmt = useFmt();
  const can = useCan();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const message = useErrorMessage();
  const branches = useBranches();
  const [pickedBranch, setBranchId] = useState('');
  const [q, setQ] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideFor, setOverrideFor] = useState<{ id: string; name: string } | null>(null);
  const [camera, setCamera] = useState(false);
  const qrRef = useRef<HTMLInputElement>(null);

  const branchId = pickedBranch || me?.staff?.branch?.id || branches.data?.[0]?.id || '';

  const lookup = useQuery({
    queryKey: ['checkin-lookup', q, branchId],
    queryFn: () => api.get<LookupRow[]>(`/admin/checkins/lookup${qs({ q, branchId })}`),
    enabled: q.trim().length >= 2 && Boolean(branchId),
  });
  const today = useQuery({
    queryKey: ['checkins-today', branchId],
    queryFn: () =>
      api.get<
        Paginated<{
          id: string;
          createdAt: string;
          status: string;
          method: string;
          rejectReason: string | null;
          member: {
            id: string;
            memberNumber: number;
            user: { profile: { firstName: string; lastName: string } | null };
          };
        }>
      >(`/admin/checkins${qs({ branchId, date: localDateKey(new Date()), pageSize: 20 })}`),
    enabled: Boolean(branchId) && can('checkin.read'),
    refetchInterval: 30_000,
  });

  const submit = async (body: { qrToken?: string; memberId?: string }) => {
    if (!branchId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Result>('/admin/checkins', { ...body, branchId });
      setResult(res);
      setQr('');
      await qc.invalidateQueries({ queryKey: ['checkins-today'] });
      await qc.invalidateQueries({ queryKey: ['checkin-lookup'] });
    } catch (e) {
      setResult(null);
      setError(
        e instanceof ApiError && e.code === 'ALREADY_CHECKED_IN'
          ? t('already', { time: fmt.time(String(e.details?.at ?? new Date().toISOString())) })
          : message(e),
      );
    } finally {
      setBusy(false);
      qrRef.current?.focus();
    }
  };

  const override = async (reason: string) => {
    if (!overrideFor) return;
    try {
      const res = await api.post<Result>('/admin/checkins/override', { memberId: overrideFor.id, branchId, reason });
      setResult(res);
      setError(null);
      setOverrideFor(null);
      await qc.invalidateQueries({ queryKey: ['checkins-today'] });
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <AdminPage
      title={t('title')}
      description={t('lead')}
      actions={
        <Select
          aria-label={t('branch')}
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          disabled={Boolean(me?.staff?.branch)}
          className="min-w-56"
        >
          {(branches.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {fmt.t(b.name)}
            </option>
          ))}
        </Select>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (qr.trim()) void submit({ qrToken: qr.trim() });
              }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <div className="relative flex-1">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  ref={qrRef}
                  autoFocus
                  value={qr}
                  onChange={(e) => setQr(e.target.value)}
                  placeholder={t('qrPlaceholder')}
                  aria-label={t('qrPlaceholder')}
                  className="h-12 pl-9 font-mono"
                  autoComplete="off"
                />
              </div>
              <Button type="submit" size="lg" loading={busy} disabled={!qr.trim()}>
                {t('checkIn')}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => setCamera((c) => !c)}
                aria-pressed={camera}
              >
                {camera ? <CameraOff /> : <Camera />} {t('camera')}
              </Button>
            </form>
            {camera && <QrCamera onCode={(code) => void submit({ qrToken: code })} />}
            <p className="mt-3 text-xs text-muted">{t('qrHint')}</p>
          </Card>

          <div aria-live="polite">
            {error && (
              <Card className="flex items-start gap-4 border-danger/40 bg-danger-soft p-6">
                <XCircle className="size-8 shrink-0 text-danger" />
                <p className="font-semibold text-danger">{error}</p>
              </Card>
            )}
            {result && (
              <Card
                className={cn(
                  'p-6',
                  result.accepted ? 'border-success/40 bg-success-soft' : 'border-danger/40 bg-danger-soft',
                )}
              >
                <div className="flex items-start gap-4">
                  {result.accepted ? (
                    <CheckCircle2 className="size-10 shrink-0 text-success" />
                  ) : (
                    <XCircle className="size-10 shrink-0 text-danger" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'font-display text-xl font-semibold',
                        result.accepted ? 'text-success' : 'text-danger',
                      )}
                    >
                      {result.accepted ? t('accepted') : t('rejected')}
                    </p>
                    {!result.accepted && result.reason && (
                      <p className="mt-1 font-medium text-danger">{reasons(result.reason)}</p>
                    )}
                    <div className="mt-4 flex items-center gap-3">
                      <Avatar
                        src={result.member.avatarUrl}
                        name={`${result.member.firstName} ${result.member.lastName}`}
                        className="size-12"
                      />
                      <div>
                        <Link href={`/admin/members/${result.member.id}`} className="font-semibold hover:underline">
                          {result.member.firstName} {result.member.lastName}
                        </Link>
                        <p className="text-sm text-muted">FC-{String(result.member.memberNumber).padStart(6, '0')}</p>
                      </div>
                    </div>
                    {result.membership && (
                      <p className="mt-3 text-sm">
                        {result.membership.planName ? fmt.t(result.membership.planName) : ''} ·{' '}
                        {t('until', { date: fmt.lastDay(result.membership.endsAt) })}
                        {result.membership.remainingVisits !== null &&
                          ` · ${t('visitsLeft', { count: result.membership.remainingVisits })}`}
                      </p>
                    )}
                    {!result.accepted && can('checkin.override') && (
                      <Button
                        className="mt-4"
                        variant="outline"
                        onClick={() =>
                          setOverrideFor({
                            id: result.member.id,
                            name: `${result.member.firstName} ${result.member.lastName}`,
                          })
                        }
                      >
                        <ShieldAlert /> {t('override')}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader title={t('search')} description={t('searchLead')} />
            <div className="p-4">
              <SearchInput value={q} onChange={setQ} placeholder={t('searchPlaceholder')} />
            </div>
            {q.trim().length < 2 ? (
              <EmptyState icon={<UserSearch />} title={t('typeToSearch')} />
            ) : !lookup.data?.length ? (
              <EmptyState title={lookup.isLoading ? t('searching') : t('noMatches')} />
            ) : (
              <ul className="divide-y divide-border">
                {lookup.data.map((r) => (
                  <li key={r.id} className="flex items-center gap-4 px-5 py-3">
                    <Avatar src={r.avatarUrl} name={`${r.firstName} ${r.lastName}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {r.firstName} {r.lastName}{' '}
                        <span className="text-xs font-normal text-muted">
                          FC-{String(r.memberNumber).padStart(6, '0')}
                        </span>
                      </p>
                      <p className="text-sm text-muted">
                        {r.membership
                          ? `${fmt.t(r.membership.planName)} · ${t('until', { date: fmt.lastDay(r.membership.endsAt) })}`
                          : t('noMembership')}
                      </p>
                    </div>
                    {r.eligible ? (
                      <Badge tone="success">{t('ok')}</Badge>
                    ) : (
                      <Badge tone="danger">{r.reason ? reasons(r.reason) : t('notEligible')}</Badge>
                    )}
                    <Button
                      size="sm"
                      variant={r.eligible ? 'primary' : 'outline'}
                      onClick={() => submit({ memberId: r.id })}
                      loading={busy}
                    >
                      {t('checkIn')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader
            title={t('today')}
            description={
              today.data
                ? t('todayCount', { count: today.data.items.filter((c) => c.status === 'ACCEPTED').length })
                : undefined
            }
          />
          {!today.data?.items.length ? (
            <EmptyState title={t('noneToday')} />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {today.data.items.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <Link href={`/admin/members/${c.member.id}`} className="font-medium hover:text-primary">
                    {c.member.user.profile?.firstName} {c.member.user.profile?.lastName}
                  </Link>
                  <span className="flex items-center gap-2">
                    {c.status === 'ACCEPTED' ? (
                      <Badge tone="success">{fmt.time(c.createdAt)}</Badge>
                    ) : (
                      <Badge tone="danger">{c.rejectReason ? reasons(c.rejectReason) : t('rejected')}</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(overrideFor)}
        onOpenChange={(o) => !o && setOverrideFor(null)}
        title={t('overrideTitle', { name: overrideFor?.name ?? '' })}
        description={t('overrideLead')}
        confirmLabel={t('override')}
        requireReason
        onConfirm={override}
      />
    </AdminPage>
  );
}

/** Uses the browser BarcodeDetector when available; USB/Bluetooth scanners work through the text field. */
function QrCamera({ onCode }: { onCode: (code: string) => void }) {
  const t = useTranslations('admin.checkin');
  const video = useRef<HTMLVideoElement>(null);
  const [unsupported, setUnsupported] = useState(
    () => !window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia,
  );
  const last = useRef<{ code: string; at: number } | null>(null);
  const callback = useRef(onCode);
  useEffect(() => {
    callback.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (unsupported || !window.BarcodeDetector) return;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s;
        if (!video.current || stopped) return;
        video.current.srcObject = s;
        await video.current.play();
        const scan = async () => {
          if (stopped || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            const code = codes[0]?.rawValue;
            if (code && (!last.current || last.current.code !== code || Date.now() - last.current.at > 5000)) {
              last.current = { code, at: Date.now() };
              callback.current(code);
            }
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(() => void scan());
        };
        void scan();
      })
      .catch(() => setUnsupported(true));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [unsupported]);

  if (unsupported)
    return <p className="mt-4 rounded-md bg-warning-soft p-3 text-sm text-warning">{t('cameraUnsupported')}</p>;
  return (
    <video
      ref={video}
      className="mt-4 aspect-video w-full rounded-lg bg-ink object-cover"
      muted
      playsInline
      aria-label={t('camera')}
    />
  );
}
