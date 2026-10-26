'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { History, MailPlus, Pencil, Send, UserCog } from 'lucide-react';
import {
  canChangeStaffRole,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  type LocalizedText,
  type Role,
  type StaffRole,
} from '@fitclub/shared';
import { api } from '@/lib/api';
import { useCan, useMe } from '@/lib/hooks';
import { useFmt } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Avatar } from '@/components/ui/controls';
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { AdminPage, ConfirmDialog, issuesToMap, useAdminMutation } from '@/components/admin/kit';
import { useBranches } from '@/components/admin/hooks';

interface StaffRow {
  id: string;
  userId: string;
  role: StaffRole;
  title: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  branch: { id: string; name: LocalizedText } | null;
  user: {
    id: string;
    email: string;
    lastLoginAt: string | null;
    profile: { firstName: string; lastName: string; phone: string | null; avatarUrl: string | null } | null;
    trainer: { id: string } | null;
  };
}

export default function StaffAdmin() {
  const t = useTranslations('admin.staff');
  const roles = useTranslations('enums.role');
  const fmt = useFmt();
  const can = useCan();
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-staff'],
    queryFn: () => api.get<StaffRow[]>('/admin/staff'),
  });
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [status, setStatus] = useState<StaffRow | null>(null);
  const [activity, setActivity] = useState<StaffRow | null>(null);
  const resend = useAdminMutation((userId: string) => api.post(`/admin/staff/${userId}/resend-invite`), {
    success: t('inviteResent'),
  });
  const toggle = useAdminMutation(
    (reason: string) =>
      api.post(`/admin/staff/${status!.userId}/status`, {
        status: status!.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
        reason,
      }),
    { invalidate: [['admin-staff']], onSuccess: () => setStatus(null) },
  );
  const manageable = (row: StaffRow) =>
    Boolean(
      me &&
        can('staff.manage') &&
        canChangeStaffRole({
          actorId: me.id,
          actorRole: me.role,
          targetId: row.userId,
          targetRole: row.role,
          nextRole: row.role,
        }).allowed,
    );

  return (
    <AdminPage
      title={t('title')}
      description={t('lead')}
      actions={
        can('staff.manage') && (
          <Button onClick={() => setInviting(true)}>
            <MailPlus /> {t('invite')}
          </Button>
        )
      }
    >
      <Card>
        {isLoading ? (
          <Skeleton className="m-4 h-56" />
        ) : !data?.length ? (
          <EmptyState icon={<UserCog />} title={t('empty')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('person')}</Th>
                <Th>{t('role')}</Th>
                <Th>{t('branch')}</Th>
                <Th>{t('lastLogin')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const name = s.user.profile ? `${s.user.profile.firstName} ${s.user.profile.lastName}` : s.user.email;
                return (
                  <tr key={s.id} className={s.status === 'SUSPENDED' ? 'opacity-55' : undefined}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar src={s.user.profile?.avatarUrl} name={name} />
                        <div>
                          <p className="font-semibold">
                            {name}{' '}
                            {s.userId === me?.id && (
                              <span className="text-xs font-normal text-muted">({t('you')})</span>
                            )}
                          </p>
                          <p className="text-xs text-muted">{s.user.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={s.role === 'OWNER' ? 'dark' : s.role === 'ADMIN' ? 'primary' : 'neutral'}>
                        {roles(s.role)}
                      </Badge>
                      {s.status === 'SUSPENDED' && (
                        <Badge tone="danger" className="ml-1.5">
                          {t('suspended')}
                        </Badge>
                      )}
                      {s.title && <span className="block text-xs text-muted">{s.title}</span>}
                    </Td>
                    <Td>{s.branch ? fmt.t(s.branch.name) : t('allBranches')}</Td>
                    <Td className="text-sm text-muted">
                      {s.user.lastLoginAt ? (
                        fmt.relative(s.user.lastLoginAt)
                      ) : (
                        <span className="text-warning">{t('neverLoggedIn')}</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        {can('audit.read') && (
                          <Button size="sm" variant="ghost" onClick={() => setActivity(s)} aria-label={t('activity')}>
                            <History />
                          </Button>
                        )}
                        {manageable(s) && !s.user.lastLoginAt && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => resend.mutate(s.userId)}
                            aria-label={t('resend')}
                          >
                            <Send />
                          </Button>
                        )}
                        {manageable(s) && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label={t('edit')}>
                              <Pencil />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={s.status === 'ACTIVE' ? 'text-danger' : ''}
                              onClick={() => setStatus(s)}
                            >
                              {s.status === 'ACTIVE' ? t('suspend') : t('reactivate')}
                            </Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <PermissionMatrix />
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      {editing && <RoleDialog row={editing} onClose={() => setEditing(null)} />}
      {activity && <ActivityDialog row={activity} onClose={() => setActivity(null)} />}
      <ConfirmDialog
        open={Boolean(status)}
        onOpenChange={(o) => !o && setStatus(null)}
        title={status?.status === 'ACTIVE' ? t('suspendTitle') : t('reactivate')}
        description={status?.status === 'ACTIVE' ? t('suspendLead') : undefined}
        confirmLabel={status?.status === 'ACTIVE' ? t('suspend') : t('reactivate')}
        danger={status?.status === 'ACTIVE'}
        requireReason
        loading={toggle.isPending}
        onConfirm={(r) => toggle.mutate(r)}
      />
    </AdminPage>
  );
}

function assignableRoles(actor: Role): StaffRole[] {
  return STAFF_ROLES.filter(
    (r) => canChangeStaffRole({ actorId: 'a', actorRole: actor, targetId: 'b', targetRole: null, nextRole: r }).allowed,
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('admin.staff');
  const roles = useTranslations('enums.role');
  const fmt = useFmt();
  const { data: me } = useMe();
  const branches = useBranches();
  const options = me ? assignableRoles(me.role) : [];
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: options.includes('RECEPTIONIST') ? 'RECEPTIONIST' : (options[0] ?? 'RECEPTIONIST'),
    branchId: '',
    title: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const invite = useAdminMutation(
    () =>
      api.post('/admin/staff/invitations', {
        ...form,
        branchId: form.branchId || null,
        title: form.title || undefined,
      }),
    {
      invalidate: [['admin-staff']],
      success: t('invited'),
      onSuccess: onClose,
      onError: (e) => {
        const map = issuesToMap(e);
        setErrors(map);
        return Object.keys(map).length > 0;
      },
    },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader title={t('invite')} description={t('inviteLead')} />
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('firstName')} error={errors.firstName}>
            {(p) => (
              <Input {...p} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            )}
          </Field>
          <Field label={t('lastName')} error={errors.lastName}>
            {(p) => (
              <Input {...p} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            )}
          </Field>
          <Field label="E-mail" error={errors.email} className="sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('role')}>
            {(p) => (
              <Select
                {...p}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}
              >
                {options.map((r) => (
                  <option key={r} value={r}>
                    {roles(r)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('branch')} hint={t('branchHint')}>
            {(p) => (
              <Select {...p} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">{t('allBranches')}</option>
                {(branches.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {fmt.t(b.name)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('jobTitle')} className="sm:col-span-2">
            {(p) => <Input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
          </Field>
          <p className="text-xs text-muted sm:col-span-2">{t('inviteNote')}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => invite.mutate(undefined)} loading={invite.isPending}>
            {t('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({ row, onClose }: { row: StaffRow; onClose: () => void }) {
  const t = useTranslations('admin.staff');
  const roles = useTranslations('enums.role');
  const fmt = useFmt();
  const { data: me } = useMe();
  const branches = useBranches();
  const options = me ? assignableRoles(me.role) : [];
  const [form, setForm] = useState({ role: row.role, branchId: row.branch?.id ?? '', title: row.title ?? '' });
  const save = useAdminMutation(
    () =>
      api.put(`/admin/staff/${row.userId}`, {
        role: form.role,
        branchId: form.branchId || null,
        title: form.title || null,
      }),
    { invalidate: [['admin-staff']], success: t('saved'), onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader title={t('editRole')} description={t('editRoleLead')} />
        <DialogBody className="space-y-4">
          <Field label={t('role')}>
            {(p) => (
              <Select
                {...p}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}
              >
                {Array.from(new Set([row.role, ...options])).map((r) => (
                  <option key={r} value={r} disabled={!options.includes(r)}>
                    {roles(r)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('branch')}>
            {(p) => (
              <Select {...p} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">{t('allBranches')}</option>
                {(branches.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {fmt.t(b.name)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('jobTitle')}>
            {(p) => <Input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
          </Field>
          <p className="text-xs text-muted">{t('roleChangeNote')}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivityDialog({ row, onClose }: { row: StaffRow; onClose: () => void }) {
  const t = useTranslations('admin.staff');
  const fmt = useFmt();
  const { data, isLoading } = useQuery({
    queryKey: ['staff-activity', row.userId],
    queryFn: () =>
      api.get<{ id: string; action: string; entityType: string; createdAt: string }[]>(
        `/admin/staff/${row.userId}/activity`,
      ),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader title={t('activityTitle', { name: row.user.profile?.firstName ?? row.user.email })} />
        <DialogBody>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : !data?.length ? (
            <EmptyState title={t('noActivity')} />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-2">
                  <code className="rounded bg-surface-2 px-1.5 text-xs">{a.action}</code>
                  <span className="text-muted">{fmt.dateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** Read-only view of the permission matrix enforced by the API. */
function PermissionMatrix() {
  const t = useTranslations('admin.staff');
  const roles = useTranslations('enums.role');
  const all = Array.from(new Set(STAFF_ROLES.flatMap((r) => ROLE_PERMISSIONS[r])));
  return (
    <details className="mt-6 rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">{t('matrix')}</summary>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-muted">{t('permission')}</th>
              {STAFF_ROLES.map((r) => (
                <th key={r} className="px-3 py-2 font-semibold text-muted">
                  {roles(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((p) => (
              <tr key={p} className="border-t border-border">
                <td className="px-3 py-1.5 font-mono">{p}</td>
                {STAFF_ROLES.map((r) => (
                  <td key={r} className="px-3 py-1.5 text-center">
                    {ROLE_PERMISSIONS[r].includes(p) ? (
                      <span className="text-success">●</span>
                    ) : (
                      <span className="text-border-strong">·</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
