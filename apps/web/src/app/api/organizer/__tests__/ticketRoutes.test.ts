/**
 * @jest-environment node
 */
// next/server (NextRequest/NextResponse) requires the Node runtime's web APIs,
// not jsdom.
jest.mock('@troptix/db', () => ({
  TicketStatus: { AVAILABLE: 'AVAILABLE', NOT_AVAILABLE: 'NOT_AVAILABLE' },
}));
jest.mock('next/headers', () => ({
  headers: jest.fn(async () => ({
    get: (k: string) => (k === 'authorization' ? 'Bearer tok' : null),
  })),
}));
jest.mock('@/server/authUser', () => ({
  getUserFromIdTokenCookie: jest.fn(),
}));
jest.mock('@/server/accessControl', () => ({
  canAccessEvent: jest.fn(),
  isPlatformOwner: jest.fn(),
}));
jest.mock('@/server/prisma', () => ({
  __esModule: true,
  default: {
    tickets: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import prisma from '@/server/prisma';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { canAccessEvent, isPlatformOwner } from '@/server/accessControl';
import { PUT as scanPUT } from '../tickets/scan/route';
import { PUT as checkInPUT } from '../tickets/check-in/route';

const db = prisma as unknown as {
  tickets: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
};
const mockGetUser = getUserFromIdTokenCookie as jest.Mock;
const mockCanAccess = canAccessEvent as jest.Mock;
const mockIsPlatformOwner = isPlatformOwner as jest.Mock;

const req = (body: unknown) => ({ json: async () => body }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetUser.mockResolvedValue({ uid: 'owner', email: 'o@usetroptix.com' });
});

describe('scan route authorization + atomicity', () => {
  it('returns 404 and never touches the ticket for a non-owner', async () => {
    mockCanAccess.mockResolvedValue(false);

    const res = await scanPUT(req({ ticketId: 't1', eventId: 'e1' }));

    expect(res.status).toBe(404);
    expect(db.tickets.updateMany).not.toHaveBeenCalled();
    expect(db.tickets.findUnique).not.toHaveBeenCalled();
  });

  it('succeeds once then reports already-scanned on the second scan', async () => {
    mockCanAccess.mockResolvedValue(true);
    db.tickets.findUnique.mockResolvedValue({
      ticketType: { name: 'GA', description: 'desc' },
    });
    db.tickets.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const first = await (
      await scanPUT(req({ ticketId: 't1', eventId: 'e1' }))
    ).json();
    const second = await (
      await scanPUT(req({ ticketId: 't1', eventId: 'e1' }))
    ).json();

    expect(first).toEqual({
      ticketName: 'GA',
      ticketDescription: 'desc',
      scanSucceeded: true,
    });
    expect(second.scanSucceeded).toBe(false);
    // Records the check-in time on the flip (roadmap 2.11).
    expect(
      db.tickets.updateMany.mock.calls[0][0].data.checkinTimestamp
    ).toBeInstanceOf(Date);
  });

  it('handles a ticket with no ticket type without throwing', async () => {
    mockCanAccess.mockResolvedValue(true);
    db.tickets.findUnique.mockResolvedValue({ ticketType: null });
    db.tickets.updateMany.mockResolvedValue({ count: 1 });

    const body = await (
      await scanPUT(req({ ticketId: 't1', eventId: 'e1' }))
    ).json();

    expect(body.ticketName).toBe('Complementary');
    expect(body.scanSucceeded).toBe(true);
  });

  it('rejects a malformed body with 400', async () => {
    mockCanAccess.mockResolvedValue(true);

    const res = await scanPUT(req({ ticketId: 't1' })); // missing eventId

    expect(res.status).toBe(400);
    expect(mockCanAccess).not.toHaveBeenCalled();
  });
});

describe('check-in route platform-owner policy', () => {
  it('allows a platform owner on an event they do not own', async () => {
    mockIsPlatformOwner.mockReturnValue(true);
    db.tickets.findUnique.mockResolvedValue({
      status: 'AVAILABLE',
      event: { organizerUserId: 'someone-else' },
    });
    db.tickets.update.mockResolvedValue({ id: 't1', status: 'NOT_AVAILABLE' });

    const res = await checkInPUT(req({ ticketId: 't1' }));

    expect(res.status).toBe(200);
    expect(db.tickets.update).toHaveBeenCalledTimes(1);
    // Checking in (AVAILABLE -> NOT_AVAILABLE) stamps the time.
    expect(
      db.tickets.update.mock.calls[0][0].data.checkinTimestamp
    ).toBeInstanceOf(Date);
  });

  it('rejects a non-owner who is not a platform owner with 403', async () => {
    mockIsPlatformOwner.mockReturnValue(false);
    db.tickets.findUnique.mockResolvedValue({
      status: 'AVAILABLE',
      event: { organizerUserId: 'someone-else' },
    });

    const res = await checkInPUT(req({ ticketId: 't1' }));

    expect(res.status).toBe(403);
    expect(db.tickets.update).not.toHaveBeenCalled();
  });
});
