import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// The side effect is on POST so a cross-site navigation or prefetch can't end
// a session.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 so the browser follows with a GET; 307 would replay the POST.
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
