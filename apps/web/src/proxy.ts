import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

// Auth routes that establish or clear the session — they must always run, so an
// authenticated user is never bounced off them by the "redirect away from
// /auth/*" rule.
const MECHANISM_ROUTES = ['/auth/callback', '/auth/signout'];

/**
 * Next 16 middleware (`proxy`). Refreshes the Supabase session every request and
 * redirect-gates protected routes / auth pages on the validated claims.
 *
 * Gating is a redirect heuristic only — pages/routes still do the real check via
 * getServerUser(). Any redirect MUST carry the refreshed cookies from
 * updateSession, or the rotated session is lost.
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

/**
 * Redirect while carrying over any cookies updateSession set on `from` — so a
 * session refreshed during this request still persists across the redirect.
 */
function redirectPreservingCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
