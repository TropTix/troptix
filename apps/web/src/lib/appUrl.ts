/**
 * Server-only: `VERCEL_*` never reach the browser, so a client call silently
 * falls back to NEXT_PUBLIC_APP_URL. Needs Vercel's "System Environment
 * Variables" setting — without it prod links silently fall back too.
 */
export function getAppBaseUrl(): string {
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export function absoluteUrl(path = ''): string {
  const base = getAppBaseUrl();
  return path ? `${base}/${path.replace(/^\/+/, '')}` : base;
}
