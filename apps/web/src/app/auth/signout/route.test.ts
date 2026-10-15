/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST } from './route';

const APP_ORIGIN = 'https://example.com';
const SUPABASE_URL = 'https://abcdefgh.supabase.co';
const AUTH_COOKIE = 'sb-abcdefgh-auth-token';

const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};
const originalFetch = global.fetch;

function sessionCookie() {
  const session = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-1' },
  };
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

function makeRequest() {
  return new NextRequest(`${APP_ORIGIN}/auth/signout`, {
    method: 'POST',
    headers: { cookie: `${AUTH_COOKIE}=${sessionCookie()}` },
  });
}

function mockLogout(status: number) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith(`${SUPABASE_URL}/auth/v1/logout`)) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    return new Response(status === 204 ? null : '{"message":"nope"}', {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function authCookieDeletions(res: Response) {
  return res.headers
    .getSetCookie()
    .filter((cookie) => cookie.startsWith(`${AUTH_COOKIE}=;`))
    .filter((cookie) => /max-age=0/i.test(cookie));
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalEnv.key;
  global.fetch = originalFetch;
});

it('clears the auth cookie and redirects home when Supabase accepts the sign-out', async () => {
  const fetchMock = mockLogout(204);

  const res = await POST(makeRequest());

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(authCookieDeletions(res)).toHaveLength(1);
  expect(res.status).toBe(303);
  expect(res.headers.get('location')).toBe(`${APP_ORIGIN}/`);
});

it('keeps the auth cookie and does not redirect when Supabase rejects the sign-out', async () => {
  mockLogout(500);

  const res = await POST(makeRequest());

  expect(authCookieDeletions(res)).toHaveLength(0);
  expect(res.headers.get('set-cookie')).toBeNull();
  expect(res.headers.get('location')).toBeNull();
  expect(res.status).toBe(500);
  expect(await res.text()).toContain('Sign-out did not complete');
});
