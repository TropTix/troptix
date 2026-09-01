/**
 * @jest-environment node
 */
// createClient's cookies()-reading path and the auth boundary's identity
// contract only make sense under the Node runtime, not jsdom.
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@/server/prisma', () => ({
  __esModule: true,
  default: { users: { findUnique: jest.fn() } },
}));
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import prisma from '@/server/prisma';
import {
  getCurrentUserProfile,
  getServerUser,
  getUserFromIdTokenCookie,
} from './authUser';

const mockCreateClient = createClient as jest.Mock;
const mockCookies = cookies as jest.Mock;
const mockFindUnique = prisma.users.findUnique as jest.Mock;
const mockGetClaims = jest.fn();

const SESSION_COOKIE = { name: 'sb-example-auth-token', value: 'jwt' };

const AUTH_SUB = '11111111-1111-1111-1111-111111111111';
const APP_USER_ID = 'app-user-1';

// process.env is shared across every file in a Jest worker, so restore rather
// than delete.
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  mockCreateClient.mockResolvedValue({
    auth: { getClaims: mockGetClaims },
  });
  mockCookies.mockResolvedValue({ getAll: () => [SESSION_COOKIE] });
});

afterEach(() => {
  jest.restoreAllMocks();
  if (ORIGINAL_SUPABASE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  }
});

describe('getServerUser', () => {
  it('resolves uid to the app Users.id, not the auth sub (ADR 0011/0015)', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: AUTH_SUB } } });
    mockFindUnique.mockResolvedValue({
      id: APP_USER_ID,
      email: 'a@example.com',
      role: 'PATRON',
      isPlatformOwner: false,
    });

    const result = await getServerUser();

    expect(result?.uid).toBe(APP_USER_ID);
    expect(result?.uid).not.toBe(AUTH_SUB);
  });

  it('returns null when the auth sub has no linked Users row', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: AUTH_SUB } } });
    mockFindUnique.mockResolvedValue(null);

    const result = await getServerUser();

    expect(result).toBeNull();
  });

  it('returns null and skips Prisma when getClaims yields no claims', async () => {
    mockGetClaims.mockResolvedValue({ data: null });

    const result = await getServerUser();

    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('returns null and logs when getClaims throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetClaims.mockRejectedValue(new Error('network down'));

    const result = await getServerUser();

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns null and skips createClient when Supabase env is unset', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const result = await getServerUser();

    expect(result).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('returns null and skips getClaims when no session cookie is present', async () => {
    mockCookies.mockResolvedValue({
      getAll: () => [{ name: 'other-cookie', value: 'x' }],
    });

    const result = await getServerUser();

    expect(result).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockGetClaims).not.toHaveBeenCalled();
  });

  it('takes the getClaims path when the session cookie is chunked', async () => {
    mockCookies.mockResolvedValue({
      getAll: () => [{ name: 'sb-example-auth-token.0', value: 'chunk' }],
    });
    mockGetClaims.mockResolvedValue({ data: null });

    const result = await getServerUser();

    expect(result).toBeNull();
    expect(mockGetClaims).toHaveBeenCalled();
  });

  it('falls back isPlatformOwner to false when the row has it as null', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: AUTH_SUB } } });
    mockFindUnique.mockResolvedValue({
      id: APP_USER_ID,
      email: 'a@example.com',
      role: 'PATRON',
      isPlatformOwner: null,
    });

    const result = await getServerUser();

    expect(result?.isPlatformOwner).toBe(false);
  });
});

describe('getUserFromIdTokenCookie', () => {
  it('passes an explicit token through to getClaims', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: AUTH_SUB } } });
    mockFindUnique.mockResolvedValue({
      id: APP_USER_ID,
      email: 'a@example.com',
      role: 'PATRON',
      isPlatformOwner: false,
    });

    await getUserFromIdTokenCookie('bearer-token');

    expect(mockGetClaims).toHaveBeenCalledWith('bearer-token');
  });

  it('verifies an explicit token even with no session cookie (Bearer path)', async () => {
    mockCookies.mockResolvedValue({ getAll: () => [] });
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: AUTH_SUB } } });
    mockFindUnique.mockResolvedValue({
      id: APP_USER_ID,
      email: 'a@example.com',
      role: 'PATRON',
      isPlatformOwner: false,
    });

    const result = await getUserFromIdTokenCookie('bearer-token');

    expect(result?.uid).toBe(APP_USER_ID);
  });

  it('passes undefined to getClaims when no token is given (cookie path)', async () => {
    mockGetClaims.mockResolvedValue({ data: null });

    await getUserFromIdTokenCookie();

    expect(mockGetClaims).toHaveBeenCalledWith(undefined);
  });
});

describe('getCurrentUserProfile', () => {
  it('returns the profile keyed on the app Users.id, not the auth sub (ADR 0011/0015)', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: AUTH_SUB } } });
    mockFindUnique.mockResolvedValue({
      id: APP_USER_ID,
      email: 'a@example.com',
      firstName: 'A',
      lastName: 'B',
      role: 'PATRON',
      stripeId: null,
      isPlatformOwner: false,
    });

    const profile = await getCurrentUserProfile();

    expect(profile?.id).toBe(APP_USER_ID);
    expect(profile?.id).not.toBe(AUTH_SUB);
  });

  it('returns null when the auth sub has no linked Users row', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: AUTH_SUB } } });
    mockFindUnique.mockResolvedValue(null);

    const profile = await getCurrentUserProfile();

    expect(profile).toBeNull();
  });
});
