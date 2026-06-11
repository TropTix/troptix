import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Sign-out escape hatch. Navigating to /auth/signout clears the Supabase session
 * (cookies) server-side and redirects home. Useful when the app shows you as
 * logged out but a stale session cookie lingers — so there's no header button to
 * click. The header's dropdown sign-out uses the client `signOut()` directly;
 * this is the always-reachable fallback.
 */
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
