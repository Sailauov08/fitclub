import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

const API = process.env.API_ORIGIN ?? 'http://localhost:4000';

/**
 * Called by the admin after content edits so public pages refresh immediately instead of
 * waiting for ISR. The caller must be signed-in staff with `content.manage` (checked by the API).
 */
export async function POST(request: NextRequest) {
  const session = request.cookies.get('fc_session')?.value;
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const me = await fetch(`${API}/api/auth/me`, { headers: { cookie: `fc_session=${session}` }, cache: 'no-store' });
  if (!me.ok) return NextResponse.json({ ok: false }, { status: 401 });
  const user = (await me.json()) as { permissions: string[] };
  const allowed = [
    'content.manage',
    'plans.manage',
    'classes.manage',
    'trainers.manage',
    'branches.manage',
    'promotions.manage',
    'settings.manage',
  ];
  if (!user.permissions.some((p) => allowed.includes(p))) return NextResponse.json({ ok: false }, { status: 403 });
  revalidateTag('content', 'max');
  return NextResponse.json({ ok: true });
}
