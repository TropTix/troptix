/**
 * @jest-environment node
 */
// next/server (NextResponse) requires the Node runtime's web APIs, not jsdom
// (the Jest config sets jsdom globally).

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

const mockCreateClient = createClient as jest.Mock;

const APP_ORIGIN = 'https://example.com';

function makeRequest(query: string) {
  return new Request(`${APP_ORIGIN}/auth/callback${query}`);
}

function mockSupabase({
  exchangeError = null,
  verifyError = null,
}: {
  exchangeError?: Error | null;
  verifyError?: Error | null;
} = {}) {
  mockCreateClient.mockResolvedValue({
    auth: {
      exchangeCodeForSession: jest.fn(async () => ({ error: exchangeError })),
      verifyOtp: jest.fn(async () => ({ error: verifyError })),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('redirect-target resolution', () => {
  const cases: Array<[string, string]> = [
    ['absent', ''],
    ['/orders', '?next=%2Forders'],
    ['//evil.example', '?next=%2F%2Fevil.example'],
    ['@evil.example', '?next=%40evil.example'],
    ['.evil.example', '?next=.evil.example'],
    ['https://evil.example', '?next=https%3A%2F%2Fevil.example'],
    ['\\evil.example', '?next=%5Cevil.example'],
  ];

  it.each(cases)(
    'next=%s stays on the app origin',
    async (_label, nextQuery) => {
      mockSupabase();
      const sep = nextQuery ? '&' : '?';
      const request = makeRequest(`${nextQuery}${sep}code=abc123`);

      const res = await GET(request);
      const location = res.headers.get('location')!;

      expect(new URL(location).host).toBe('example.com');
    }
  );
});

describe('flow cases', () => {
  it('redirects to the resolved next on a successful code exchange', async () => {
    mockSupabase();
    const request = makeRequest('?code=abc123&next=/orders');

    const res = await GET(request);
    const location = res.headers.get('location')!;

    expect(new URL(location).host).toBe('example.com');
    expect(new URL(location).pathname).toBe('/orders');
  });

  it('redirects to the resolved next on a successful token_hash + type verification', async () => {
    mockSupabase();
    const request = makeRequest('?token_hash=tok123&type=email&next=/orders');

    const res = await GET(request);
    const location = res.headers.get('location')!;

    expect(new URL(location).host).toBe('example.com');
    expect(new URL(location).pathname).toBe('/orders');
  });

  it('redirects to sign-in with an error when neither code nor token_hash is present', async () => {
    mockSupabase();
    const request = makeRequest('?next=/orders');

    const res = await GET(request);
    const location = res.headers.get('location')!;

    expect(location).toBe(`${APP_ORIGIN}/auth/signin?error=auth`);
  });

  it('redirects to sign-in with an error when Supabase returns an error', async () => {
    mockSupabase({ exchangeError: new Error('nope') });
    const request = makeRequest('?code=abc123&next=/orders');

    const res = await GET(request);
    const location = res.headers.get('location')!;

    expect(location).toBe(`${APP_ORIGIN}/auth/signin?error=auth`);
  });
});
