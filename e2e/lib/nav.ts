import type { Page } from '@playwright/test';

// First navigation of a test carries the Deployment Protection bypass as query
// params; `x-vercel-set-bypass-cookie` makes Vercel set a cookie so every later
// request (including the return from Stripe's redirect) is let through. Query
// params rather than extraHTTPHeaders: headers would ride along on cross-origin
// requests to Stripe and trip CORS.
export async function goto(page: Page, pathname: string) {
  const secret = process.env.E2E_VERCEL_BYPASS;
  if (!secret) {
    await page.goto(pathname);
    return;
  }
  const url = new URL(pathname, 'http://placeholder.local');
  url.searchParams.set('x-vercel-protection-bypass', secret);
  url.searchParams.set('x-vercel-set-bypass-cookie', 'true');
  await page.goto(url.pathname + url.search);
}
