import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

// Session-establishing/clearing routes must always run — the redirect-away-from-
// /auth/* rule would otherwise bounce an authenticated user off signout.
const MECHANISM_ROUTES = ['/auth/callback', '/auth/signout'];

/**
 * Gating here is a redirect heuristic only — pages/routes still do the real
 * check via getServerUser(). Any redirect MUST carry the refreshed cookies from
 * updateSession, or the rotated session is silently lost.
 */
export async function proxy(req: NextRequest) {
  const { response, claims } = await updateSession(req);

  const isProtected =
    req.nextUrl.pathname.startsWith('/admin') ||
    req.nextUrl.pathname.startsWith('/account') ||
    req.nextUrl.pathname.startsWith('/organizer') ||
    req.nextUrl.pathname === '/orders';

  const isAuthPage =
    req.nextUrl.pathname.startsWith('/auth') &&
    !MECHANISM_ROUTES.some((route) => req.nextUrl.pathname.startsWith(route));
  const isAuthenticated = Boolean(claims);

  if (isAuthPage && isAuthenticated) {
    return redirectPreservingCookies(new URL('/', req.url), response);
  }

  if (isProtected && !isAuthenticated) {
    return redirectPreservingCookies(
      new URL('/auth/signin', req.url),
      response
    );
  }

  return response;
}

function redirectPreservingCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
