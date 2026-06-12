import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client (Client Components). `createBrowserClient` is a
 * singleton, so calling this repeatedly is cheap. The publishable key is safe in
 * the browser — access is governed by RLS, not key secrecy.
 * https://supabase.com/docs/guides/auth/server-side/creating-a-client
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
