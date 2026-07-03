jest.mock('@troptix/db', () => ({
  TicketStatus: { AVAILABLE: 'AVAILABLE', NOT_AVAILABLE: 'NOT_AVAILABLE' },
}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/server/authUser', () => ({ getUserFromIdTokenCookie: jest.fn() }));
jest.mock('@/server/accessControl', () => ({
  verifyEventAccess: jest.fn(),
  getEventWhereClause: jest.fn(() => ({})),
}));
jest.mock('@/server/prisma', () => ({
  __esModule: true,
  default: { tickets: { findFirst: jest.fn(), update: jest.fn() } },
}));

import prisma from '@/server/prisma';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { toggleTicketStatus } from './attendeeActions';

const db = prisma as unknown as {
  tickets: { findFirst: jest.Mock; update: jest.Mock };
};
const mockGetUser = getUserFromIdTokenCookie as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetUser.mockResolvedValue({ uid: 'owner', email: 'o@b.com' });
  db.tickets.update.mockResolvedValue({ id: 't1', status: 'NOT_AVAILABLE' });
});

describe('toggleTicketStatus check-in timestamp', () => {
  it('stamps checkinTimestamp when checking a ticket in', async () => {
    db.tickets.findFirst.mockResolvedValue({ id: 't1', status: 'AVAILABLE' });

    await toggleTicketStatus('t1', 'e1');

    const data = db.tickets.update.mock.calls[0][0].data;
    expect(data.status).toBe('NOT_AVAILABLE');
    expect(data.checkinTimestamp).toBeInstanceOf(Date);
  });

  it('clears checkinTimestamp when undoing a check-in', async () => {
    db.tickets.findFirst.mockResolvedValue({
      id: 't1',
      status: 'NOT_AVAILABLE',
    });

    await toggleTicketStatus('t1', 'e1');

    const data = db.tickets.update.mock.calls[0][0].data;
    expect(data.status).toBe('AVAILABLE');
    expect(data.checkinTimestamp).toBeNull();
  });
});
