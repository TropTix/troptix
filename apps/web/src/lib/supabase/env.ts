export interface SupabaseEnv {
  url: string;
  key: string;
}

/**
 * Returns null, and logs which variable is missing, instead of letting
 * `createServerClient` throw: that throw once ran on every request and took
 * the whole site down. Callers treat null as "no session".
 */
export function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) return { url, key };

  const missing = [
    url ? null : 'NEXT_PUBLIC_SUPABASE_URL',
    key ? null : 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ].filter((name) => name !== null);
  console.error(
    `Supabase auth env missing: ${missing.join(' and ')} not set. Every viewer is signed out and no one can sign in until it is.`
  );
  return null;
}
