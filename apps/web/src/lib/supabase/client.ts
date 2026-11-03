import { createBrowserClient } from '@supabase/ssr';
import { readSupabaseEnv } from '@/lib/supabase/env';

export function createClient() {
  const env = readSupabaseEnv();
  return env ? createBrowserClient(env.url, env.key) : null;
}

/** For user actions (sign-in, upload) that cannot proceed without a client. */
export function requireClient() {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase auth env missing');
  return supabase;
}
