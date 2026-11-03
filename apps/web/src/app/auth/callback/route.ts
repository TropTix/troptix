import { NextResponse, after } from 'next/server';
import type { AuthError, EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { captureSignInFailed } from '@/server/lib/analytics';

type ServerFailure = { status?: number; errorCode?: string };

// A 5xx is our side failing (e.g. the provisioning trigger, ADR 0036), not a
// bad or expired link.
function serverFailure(error: AuthError | null): ServerFailure | undefined {
  if (!error || (error.status ?? 0) < 500) return undefined;
  return { status: error.status, errorCode: error.code };
}

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
  let failure: ServerFailure | undefined;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
    failure = serverFailure(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    failed = Boolean(error);
    failure = serverFailure(error);
  } else {
    failed = true;
    // Supabase redirects here with ?error=server_error when its own write
    // fails, e.g. the provisioning trigger on a Google sign-in.
    if (searchParams.get('error') === 'server_error') {
      failure = { errorCode: searchParams.get('error_code') ?? undefined };
    }
  }

  if (!failed) {
    return NextResponse.redirect(resolveNext(next, origin));
  }
  if (failure) {
    const reported = failure;
    console.error('Auth callback failed on our side:', reported);
    after(() => captureSignInFailed(reported));
  }
  return NextResponse.redirect(
    new URL('/auth/signin?error=auth', origin).toString()
  );
}
