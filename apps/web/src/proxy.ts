import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
  const token = req.cookies.get('fb-token')?.value;

  const isProtected =
    req.nextUrl.pathname.startsWith('/admin') ||
    req.nextUrl.pathname.startsWith('/account') ||
    req.nextUrl.pathname.startsWith('/organizer') ||
    req.nextUrl.pathname === '/orders';

  const isAuthPage = req.nextUrl.pathname.startsWith('/auth');

  // Check if user has valid token
  let isAuthenticated = false;
  try {
    const decoded = jwt.decode(token || '') as any;
    isAuthenticated = !!decoded?.user_id;
  } catch (error) {
    isAuthenticated = false;
  }

  // Redirect authenticated users away from auth pages
  if (isAuthPage && isAuthenticated) {
    const url = new URL('/', req.url);
    return NextResponse.redirect(url);
  }

  // Handle protected routes (redirect unauthenticated users to sign in)
  if (isProtected && !isAuthenticated) {
    const url = new URL('/auth/signin', req.url);
    // url.searchParams.set('redirectedFrom', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
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
