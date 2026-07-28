// The action is a thin adapter over toggleTicketCheckIn — these tests cover
// the adapter contract (auth, error mapping, revalidate); the flip and
// authorization behavior lives in
// packages/api/src/services/organizer-checkin.test.ts.
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/server/authUser', () => ({ getUserFromIdTokenCookie: jest.fn() }));
jest.mock('@/server/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@troptix/api/server', () => {
  class NotFoundError extends Error {}
  return { toggleTicketCheckIn: jest.fn(), NotFoundError };
});

import { revalidatePath } from 'next/cache';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import {
  toggleTicketCheckIn,
  NotFoundError as FakeNotFoundError,
} from '@troptix/api/server';
import { toggleTicketStatus } from './attendeeActions';

const mockGetUser = getUserFromIdTokenCookie as jest.Mock;
const mockToggle = toggleTicketCheckIn as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetUser.mockResolvedValue({
    uid: 'owner',
    email: 'o@b.com',
    role: 'PATRON',
    isPlatformOwner: false,
  });
});

describe('toggleTicketStatus', () => {
  it('calls the seam as the caller and revalidates the attendees page', async () => {
    mockToggle.mockResolvedValue({ id: 't1', status: 'NOT_AVAILABLE' });

    const result = await toggleTicketStatus('t1', 'e1');

    expect(result).toEqual({
      success: true,
      data: { id: 't1', status: 'NOT_AVAILABLE' },
    });
    expect(mockToggle.mock.calls[0][1]).toEqual({
      kind: 'user',
      userId: 'owner',
      role: 'PATRON',
    });
    expect(mockToggle.mock.calls[0][2]).toEqual({
      ticketId: 't1',
      eventId: 'e1',
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      '/organizer/events/e1/attendees'
    );
  });

  it('maps a service NotFound to a friendly error', async () => {
    mockToggle.mockRejectedValue(new FakeNotFoundError('Ticket not found'));

    const result = await toggleTicketStatus('t1', 'e1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Ticket not found or unauthorized');
  });

  it('fails without an authenticated user', async () => {
    mockGetUser.mockResolvedValue(null);

    const result = await toggleTicketStatus('t1', 'e1');

    expect(result.success).toBe(false);
    expect(mockToggle).not.toHaveBeenCalled();
  });
});
