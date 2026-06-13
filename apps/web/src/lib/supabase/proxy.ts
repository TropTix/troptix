import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresh the Supabase session on every request and propagate the rotated auth
 * cookies (and the no-cache headers) to both the request — for downstream Server
 * Components — and the response, for the browser. This is the @supabase/ssr
 * proxy pattern (https://supabase.com/docs/guides/auth/server-side/creating-a-client),
 * adapted for Next 16 where the middleware entrypoint is `proxy.ts`.
 *
 * Returns `{ response, claims }` so the caller can gate routes on the validated
 * claims without a second round-trip. `getClaims()` verifies the JWT signature
 * locally against the project's published keys — safe to trust server-side.
 *
 * The cookie/header plumbing on `response` MUST be preserved: a caller that
 * builds a different response (e.g. a redirect) has to copy these over, or the
 * session won't persist.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          // No-cache headers so a CDN/proxy can't cache a response that carries
          // auth cookies and serve one user's session to another.
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          );
        },
      },
    }
  );

  // IMPORTANT: don't run code between createServerClient and getClaims().
  try {
    const { data } = await supabase.auth.getClaims();
    return { response, claims: data?.claims ?? null };
  } catch {
    // Auth unreachable / misconfigured — treat as no session, keep the app up.
    return { response, claims: null };
  }
}
