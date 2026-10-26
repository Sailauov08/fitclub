import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { sessionApi } from '@/lib/server-api';
import type { Me } from '@/lib/types';
import { AccountShell } from '@/components/account/shell';

export const metadata = { robots: { index: false } };
// Per-visitor pages: rendered on every request with the visitor's session, never cached.
export const dynamic = 'force-dynamic';

/** Server-side gate: the API decides who is signed in; members without a member record go to admin. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const { status, data } = await sessionApi<Me>('/auth/me');
  if (status === 401 || !data) redirect(`/${locale}/login?next=/${locale}/account`);
  if (!data.member && data.staff) redirect(`/${locale}/admin`);
  return <AccountShell me={data}>{children}</AccountShell>;
}
