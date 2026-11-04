import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Create a fresh client per request — it carries that request's cookies, so a
 * shared or cached one leaks sessions across users. Read the user via
 * `getClaims()` (verifies the JWT locally); never trust `getSession()` here.
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
            // Called from a Server Component, which can't write cookies — safe:
            // the proxy refreshes the session and writes them on every request.
          }
        },
      },
    }
  );
}
