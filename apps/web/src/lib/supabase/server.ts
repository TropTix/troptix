import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server Supabase client (Server Components, Server Actions, Route Handlers).
 * Create a fresh one per request — it carries that request's cookies.
 *
 * To read the user server-side, use `supabase.auth.getClaims()` (validates the
 * JWT signature against the project's published keys). Never trust
 * `getSession()` server-side. https://supabase.com/docs/guides/auth/server-side
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, which can't write cookies. Safe to
            // ignore — the proxy refreshes the session and writes cookies (plus
            // the required no-cache headers) on every request.
          }
        },
      },
    }
  );
}

/**
 * Read the verified JWT claims for a request from an arbitrary cookie source
 * (e.g. the Vercel Flags SDK's reader, which isn't `next/headers` cookies()).
 * Read-only — does not refresh or write cookies.
 */
export async function readClaimsFromCookies(cookieReader: {
  getAll(): { name: string; value: string }[];
}) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieReader.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
}
