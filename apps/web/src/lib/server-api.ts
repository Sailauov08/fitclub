import 'server-only';
import { cookies } from 'next/headers';

const API = process.env.API_ORIGIN ?? 'http://localhost:4000';

export class ServerApiError extends Error {
  constructor(readonly status: number) {
    super(`API responded with ${status}`);
  }
}

/**
 * Public, cacheable API reads for server components (ISR).
 *
 * Returns null for 404. When the API is unreachable it also returns null (lists and the shell degrade
 * gracefully) unless `required` is set: detail pages throw instead, so an outage renders the error page
 * (never cached) rather than a misleading — and cached — 404.
 */
export async function publicApi<T>(
  path: string,
  opts: { revalidate?: number; tags?: string[]; required?: boolean } = {},
): Promise<T | null> {
  try {
    const res = await fetch(`${API}/api${path}`, {
      next: { revalidate: opts.revalidate ?? 60, tags: ['content', ...(opts.tags ?? [])] },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new ServerApiError(res.status);
    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof ServerApiError) throw error;
    console.error(`[publicApi] ${path} failed`, error);
    if (opts.required) throw new ServerApiError(503);
    return null;
  }
}

/** Authenticated read forwarding the visitor's session cookie. Never cached. */
export async function sessionApi<T>(path: string): Promise<{ status: number; data: T | null }> {
  const jar = await cookies();
  const session = jar.get('fc_session')?.value;
  if (!session) return { status: 401, data: null };
  try {
    const res = await fetch(`${API}/api${path}`, { headers: { cookie: `fc_session=${session}` }, cache: 'no-store' });
    if (!res.ok) return { status: res.status, data: null };
    return { status: res.status, data: (await res.json()) as T };
  } catch {
    return { status: 503, data: null };
  }
}
