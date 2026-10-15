import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { readSupabaseEnv } from '@/lib/supabase/env';

/**
 * Create a fresh client per request — it carries that request's cookies, so a
 * shared or cached one leaks sessions across users. Read the user via
 * `getClaims()` (verifies the JWT locally); never trust `getSession()` here.
 * Returns null when the Supabase env is missing; callers treat that as no
 * session.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = readSupabaseEnv();
  if (!env) return null;

  return createServerClient(env.url, env.key, {
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
  });
}
