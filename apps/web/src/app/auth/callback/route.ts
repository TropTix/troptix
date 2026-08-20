import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// The `type` query param is untrusted; only these values reach verifyOtp. The
// satisfies clause keeps the list within supabase's union (typos fail to build).
const EMAIL_OTP_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const satisfies readonly EmailOtpType[];

// Parse, then compare origins. A string check like startsWith('/') misses the
// shapes a URL parser folds into the authority component.
function resolveNext(next: string | null, origin: string): string {
  if (!next) return `${origin}/`;
  try {
    const target = new URL(next, origin);
    return target.origin === origin ? target.toString() : `${origin}/`;
  } catch {
    return `${origin}/`;
  }
}

/**
 * Auth callback for both OAuth (Google) and email magic-links. Handles either
 * shape the provider/email template sends:
 *   - `code`        → PKCE / OAuth   → exchangeCodeForSession
 *   - `token_hash`  → email OTP link → verifyOtp
 * On success the session cookies are set and we redirect into the app; on
 * failure, back to sign-in. See the Supabase Next.js server-side auth guide.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const typeParam = searchParams.get('type');
  const type = EMAIL_OTP_TYPES.find((t) => t === typeParam) ?? null;
  const next = searchParams.get('next') ?? '/';

  const supabase = await createClient();

  let failed = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    failed = Boolean(error);
  } else {
    failed = true;
  }

  if (!failed) {
    return NextResponse.redirect(resolveNext(next, origin));
  }
  return NextResponse.redirect(
    new URL('/auth/signin?error=auth', origin).toString()
  );
}
