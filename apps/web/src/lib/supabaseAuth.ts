import { requireClient } from '@/lib/supabase/client';

export async function signInWithMagicLink(email: string) {
  const supabase = requireClient();
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
}

/**
 * Verify the 6-digit code from the magic-link email (the `{{ .Token }}` in the
 * template). `type: 'email'` covers both the signup and returning-login cases.
 */
export async function verifyEmailOtp(email: string, token: string) {
  const supabase = requireClient();
  return supabase.auth.verifyOtp({ email, token, type: 'email' });
}

export async function signInWithGoogle() {
  const supabase = requireClient();
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: 'select_account' },
    },
  });
}

export async function signOut() {
  const supabase = requireClient();
  return supabase.auth.signOut();
}
