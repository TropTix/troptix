import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Sign-out escape hatch, reachable by typing the URL when the header control
 * isn't available. POST does the work; GET only renders a form that posts back
 * here, so no cross-site navigation or prefetch can end a session.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url).toString(), {
    status: 303,
  });
}

export async function GET() {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Sign out</title>` +
      `<form method="post"><button type="submit">Sign out</button></form>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}
