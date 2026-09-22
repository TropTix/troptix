import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * @supabase/ssr proxy pattern: setAll writes the rotated cookies to BOTH the
 * request (for downstream Server Components) and a rebuilt response (for the
 * browser) — drop either half and that side silently keeps the stale session.
 * getClaims() verifies the JWT locally, so the claims are safe to trust.
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
