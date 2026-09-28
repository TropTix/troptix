import { headers } from 'next/headers';
import { getAppBaseUrl } from '@/lib/appUrl';

/**
 * The origin the current request arrived on. On a Vercel preview this is the
 * branch alias the person is browsing, whereas getAppBaseUrl() is the
 * deployment's own URL; a redirect back to the wrong one lands on a host
 * without their session cookie.
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return getAppBaseUrl();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}
