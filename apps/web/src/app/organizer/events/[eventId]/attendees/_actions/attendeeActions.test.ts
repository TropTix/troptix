// The action is a thin adapter over toggleTicketCheckIn — these tests cover
// the adapter contract (auth, error mapping, revalidate); the flip and
// authorization behavior lives in
// packages/api/src/services/organizer-checkin.test.ts.
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/server/authUser', () => ({ getUserFromIdTokenCookie: jest.fn() }));
jest.mock('@/server/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@troptix/api/server', () => {
  class NotFoundError extends Error {}
  class ConflictError extends Error {}
  return { toggleTicketCheckIn: jest.fn(), NotFoundError, ConflictError };
});

import { revalidatePath } from 'next/cache';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import {
  toggleTicketCheckIn,
  NotFoundError as FakeNotFoundError,
  ConflictError as FakeConflictError,
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
  it('calls the seam as the caller and revalidates the ticket’s own event page', async () => {
    mockToggle.mockResolvedValue({
      id: 't1',
      status: 'NOT_AVAILABLE',
      eventId: 'e1',
    });

    const result = await toggleTicketStatus('t1');

    expect(result).toEqual({
      success: true,
      data: { id: 't1', status: 'NOT_AVAILABLE' },
    });
    expect(mockToggle.mock.calls[0][1]).toEqual({
      kind: 'user',
      userId: 'owner',
      role: 'PATRON',
    });
    expect(mockToggle.mock.calls[0][2]).toEqual({ ticketId: 't1' });
    // The path comes from the mutation's result, never from client input.
    expect(revalidatePath).toHaveBeenCalledWith(
      '/organizer/events/e1/attendees'
    );
  });

  it('maps a service NotFound to a friendly error', async () => {
    mockToggle.mockRejectedValue(new FakeNotFoundError('Ticket not found'));

    const result = await toggleTicketStatus('t1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Ticket not found or unauthorized');
  });

  it('surfaces a ConflictError message verbatim (void or raced ticket)', async () => {
    mockToggle.mockRejectedValue(
      new FakeConflictError('This ticket is not valid for entry')
    );

    const result = await toggleTicketStatus('t1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('This ticket is not valid for entry');
  });

  it('fails without an authenticated user', async () => {
    mockGetUser.mockResolvedValue(null);

    const result = await toggleTicketStatus('t1');

    expect(result.success).toBe(false);
    // The deliberate message, not a TypeError from a null user leaking through.
    expect(result.error).toBe('User not authenticated');
    expect(mockToggle).not.toHaveBeenCalled();
  });
});
