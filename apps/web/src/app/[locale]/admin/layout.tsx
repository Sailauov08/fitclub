import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { sessionApi } from '@/lib/server-api';
import type { Me } from '@/lib/types';
import { AdminShell } from '@/components/admin/shell';

export const metadata = { title: 'Admin', robots: { index: false } };
// Per-visitor pages: rendered on every request with the visitor's session, never cached.
export const dynamic = 'force-dynamic';

/** Staff-only area. Every action inside is authorised again by the API — this gate is for UX only. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const { status, data } = await sessionApi<Me>('/auth/me');
  if (status === 401 || !data) redirect(`/${locale}/login?next=/${locale}/admin`);
  if (!data.staff) redirect(`/${locale}/account`);
  return <AdminShell me={data}>{children}</AdminShell>;
}
