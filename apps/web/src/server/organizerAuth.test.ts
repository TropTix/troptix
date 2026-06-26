import { headers } from 'next/headers';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import type { ServerUser } from '@/server/authUser';
import { extractOrganizer } from '@/server/organizerAuth';

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('@/server/authUser', () => ({
  getUserFromIdTokenCookie: jest.fn(),
}));

const mockHeaders = headers as jest.MockedFunction<typeof headers>;
const mockGetUser = getUserFromIdTokenCookie as jest.MockedFunction<
  typeof getUserFromIdTokenCookie
>;

function withAuthorization(value: string | null) {
  mockHeaders.mockResolvedValue({
    get: (name: string) =>
      name.toLowerCase() === 'authorization' ? value : null,
  } as unknown as Awaited<ReturnType<typeof headers>>);
}

describe('extractOrganizer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the organizer for a valid Bearer token', async () => {
    const user: ServerUser = { uid: 'user-1', email: 'a@b.com' };
    withAuthorization('Bearer good-token');
    mockGetUser.mockResolvedValue(user);

    const result = await extractOrganizer();

    expect(mockGetUser).toHaveBeenCalledWith('good-token');
    expect(result).toEqual({ ok: true, user });
  });

  it('returns missing-token when the header is absent', async () => {
    withAuthorization(null);

    const result = await extractOrganizer();

    expect(result).toEqual({ ok: false, failure: 'missing-token' });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns missing-token when the header is not a Bearer token', async () => {
    withAuthorization('Basic abc123');

    const result = await extractOrganizer();

    expect(result).toEqual({ ok: false, failure: 'missing-token' });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns missing-token when the Bearer token is empty', async () => {
    withAuthorization('Bearer ');

    const result = await extractOrganizer();

    expect(result).toEqual({ ok: false, failure: 'missing-token' });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns invalid-token when the token does not resolve to a user', async () => {
    withAuthorization('Bearer stale-token');
    mockGetUser.mockResolvedValue(null);

    const result = await extractOrganizer();

    expect(mockGetUser).toHaveBeenCalledWith('stale-token');
    expect(result).toEqual({ ok: false, failure: 'invalid-token' });
  });
});
