import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

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

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
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
