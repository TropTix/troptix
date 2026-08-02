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

import { createClient } from '@/lib/supabase/server';
import prisma from '@/server/prisma';
import { getServerUser, getUserFromIdTokenCookie } from './authUser';

const mockCreateClient = createClient as jest.Mock;
const mockFindUnique = prisma.users.findUnique as jest.Mock;
const mockGetClaims = jest.fn();

const AUTH_SUB = '11111111-1111-1111-1111-111111111111';
const APP_USER_ID = 'app-user-1';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  mockCreateClient.mockResolvedValue({
    auth: { getClaims: mockGetClaims },
  });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
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

  it('passes undefined to getClaims when no token is given (cookie path)', async () => {
    mockGetClaims.mockResolvedValue({ data: null });

    await getUserFromIdTokenCookie();

    expect(mockGetClaims).toHaveBeenCalledWith(undefined);
  });
});
