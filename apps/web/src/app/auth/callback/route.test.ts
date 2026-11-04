/**
 * @jest-environment node
 */

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (task: () => unknown) => task(),
}));
jest.mock('@/server/lib/analytics', () => ({
  captureSignInFailed: jest.fn(),
}));

import type { AuthError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { captureSignInFailed } from '@/server/lib/analytics';
import { GET } from './route';

const mockCreateClient = createClient as jest.Mock;
const mockCaptureSignInFailed = captureSignInFailed as jest.Mock;

const APP_ORIGIN = 'https://example.com';

function makeRequest(query: string) {
  return new Request(`${APP_ORIGIN}/auth/callback${query}`);
}

function mockSupabase({
  exchangeError = null,
  verifyError = null,
}: {
  exchangeError?: Partial<AuthError> | null;
  verifyError?: Partial<AuthError> | null;
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

    const resNoType = await GET(makeRequest('?token_hash=tok123&next=/orders'));
    expect(resNoType.headers.get('location')).toBe(
      `${APP_ORIGIN}/auth/signin?error=auth`
    );
  });

  it('redirects to sign-in with an error when Supabase returns an error', async () => {
    mockSupabase({ exchangeError: new Error('nope') });
    const request = makeRequest('?code=abc123&next=/orders');

    const res = await GET(request);
    const location = res.headers.get('location')!;

    expect(location).toBe(`${APP_ORIGIN}/auth/signin?error=auth`);
  });

  it('does not report a bad or expired link', async () => {
    mockSupabase({ verifyError: { message: 'expired', status: 403 } });

    await GET(makeRequest('?token_hash=tok123&type=email'));

    expect(mockCaptureSignInFailed).not.toHaveBeenCalled();
  });

  it('reports a server error from Supabase', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSupabase({
      exchangeError: { message: 'db', status: 500, code: 'unexpected_failure' },
    });

    const res = await GET(makeRequest('?code=abc123'));

    expect(res.headers.get('location')).toBe(
      `${APP_ORIGIN}/auth/signin?error=auth`
    );
    expect(mockCaptureSignInFailed).toHaveBeenCalledWith({
      status: 500,
      errorCode: 'unexpected_failure',
    });
  });

  it('reports a server_error redirect from Supabase (Google sign-in)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSupabase();

    await GET(makeRequest('?error=server_error&error_code=unexpected_failure'));

    expect(mockCaptureSignInFailed).toHaveBeenCalledWith({
      errorCode: 'unexpected_failure',
    });
  });
});
