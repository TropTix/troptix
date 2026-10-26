/**
 * @jest-environment node
 */

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { updateSession } from './proxy';

const mockCreateServerClient = createServerClient as jest.Mock;

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  restore('NEXT_PUBLIC_SUPABASE_URL', ORIGINAL_URL);
  restore('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ORIGINAL_KEY);
});

describe('updateSession', () => {
  it('returns the claims from a verified session when env is set', async () => {
    mockCreateServerClient.mockReturnValue({
      auth: {
        getClaims: jest.fn(async () => ({ data: { claims: { sub: 'u1' } } })),
      },
    });

    const { claims } = await updateSession(
      new NextRequest('https://example.com/orders')
    );

    expect(mockCreateServerClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_publishable_test',
      expect.anything()
    );
    expect(claims).toEqual({ sub: 'u1' });
  });

  it('passes the request through with no session when env is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const { response, claims } = await updateSession(
      new NextRequest('https://example.com/orders', {
        headers: { cookie: 'sb-example-auth-token=jwt' },
      })
    );

    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(claims).toBeNull();
    expect(response.cookies.getAll()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  });
});
