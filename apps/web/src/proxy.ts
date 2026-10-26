import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);
const PROTECTED = /^\/(kk|ru|en)\/(account|admin)(\/|$)/;

/**
 * Locale negotiation plus a fast redirect for signed-out visitors of protected areas.
 * This is only a UX shortcut — real authorization happens in the API on every request.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const match = PROTECTED.exec(pathname);
  if (match && !request.cookies.has('fc_session')) {
    const url = request.nextUrl.clone();
    url.pathname = `/${match[1]}/login`;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return intl(request);
}

export const config = {
  // Everything except API/upload proxies, Next internals and files with an extension.
  matcher: '/((?!api|uploads|cms-revalidate|_next|_vercel|.*\\..*).*)',
};
