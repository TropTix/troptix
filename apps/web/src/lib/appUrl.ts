/**
 * Resolve the app's absolute origin for links that must work outside the app
 * (emails, shareable URLs). Reads Vercel's system env vars, which omit the
 * scheme (so we prepend `https://`):
 * - preview     → this deploy's `VERCEL_URL` (checked first: the production-URL
 *   var below is set on previews too).
 * - production  → `VERCEL_PROJECT_PRODUCTION_URL`, the canonical domain.
 * - local/other → `NEXT_PUBLIC_APP_URL`, else localhost.
 *
 * Correct only in server contexts — `VERCEL_*` aren't exposed to the browser,
 * so client components fall back to `NEXT_PUBLIC_APP_URL`. Needs Vercel's
 * "System Environment Variables" setting (enabled).
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

/**
 * Build an absolute URL for an in-app path, e.g. `absoluteUrl('/events/123')`.
 * The leading slash on `path` is optional. See {@link getAppBaseUrl} for how
 * the origin is resolved (and its server-context caveat).
 */
export function absoluteUrl(path = ''): string {
  const base = getAppBaseUrl();
  return path ? `${base}/${path.replace(/^\/+/, '')}` : base;
}
