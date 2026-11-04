import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// The side effect is on POST so a cross-site navigation or prefetch can't end
// a session.
export async function POST(request: NextRequest) {
  // 303 so the browser follows with a GET; 307 would replay the POST.
  const response = NextResponse.redirect(new URL('/', request.url), {
    status: 303,
  });

  // Cookies go straight onto the returned response, not through cookies(), so
  // the deletions ride on the object this handler hands back.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.signOut();
  if (error) {
    return signOutPage('Sign-out did not complete. Try again.', 500);
  }
  return response;
}

export async function GET() {
  return signOutPage();
}

function signOutPage(message?: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Sign out</title>` +
      (message ? `<p>${message}</p>` : '') +
      `<form method="post"><button type="submit">Sign out</button></form>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}
