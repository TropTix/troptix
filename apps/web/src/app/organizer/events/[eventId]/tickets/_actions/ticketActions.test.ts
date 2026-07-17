// Mock Next.js + server deps so the actions run without a DB, session, or RSC context.
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
jest.mock('@/server/authUser', () => ({
  getUserFromIdTokenCookie: jest.fn(),
}));
jest.mock('@/server/accessControl', () => ({
  canAccessEvent: jest.fn(),
}));
jest.mock('@/server/prisma', () => ({
  __esModule: true,
  default: {
    ticketTypes: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    events: { findUnique: jest.fn() },
  },
}));

import prisma from '@/server/prisma';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { canAccessEvent } from '@/server/accessControl';
import { redirect } from 'next/navigation';
import { createTicketType, updateTicketType } from './ticketActions';
import type { TicketTypeFormValues } from '@/lib/schemas/ticketSchema';

const db = prisma as unknown as {
  ticketTypes: {
    create: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
  };
  events: { findUnique: jest.Mock };
};
const mockGetUser = getUserFromIdTokenCookie as jest.Mock;
const mockCanAccess = canAccessEvent as jest.Mock;

const validForm: TicketTypeFormValues = {
  name: 'General Admission',
  description: 'desc',
  price: 10,
  capacity: 100,
  maxPurchasePerUser: 10,
  saleStartsAt: new Date('2026-08-01T00:00:00Z'),
  saleEndsAt: new Date('2026-08-10T00:00:00Z'),
  ticketingFees: 'PASS_TICKET_FEES',
  discountCode: undefined,
};

beforeEach(() => {
  jest.clearAllMocks();
  // The actions log to console.error inside their catch blocks (e.g. the
  // Next redirect thrown on the no-session path); keep test output clean.
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe('updateTicketType authorization', () => {
  it('redirects and does not update when there is no session', async () => {
    mockGetUser.mockResolvedValue(null);

    // redirect() is resolved before the try, so its control-flow throw
    // propagates (it is not swallowed by the catch).
    await expect(updateTicketType('ticket_1', validForm)).rejects.toThrow(
      'NEXT_REDIRECT'
    );

    expect(redirect).toHaveBeenCalledWith('/auth/signin');
    expect(db.ticketTypes.update).not.toHaveBeenCalled();
  });

  it('rejects a user who does not own the event', async () => {
    mockGetUser.mockResolvedValue({ uid: 'attacker', email: 'a@b.com' });
    db.ticketTypes.findUnique.mockResolvedValue({ eventId: 'event_1' });
    mockCanAccess.mockResolvedValue(false);

    const result = await updateTicketType('ticket_1', validForm);

    expect(mockCanAccess).toHaveBeenCalledWith(
      'attacker',
      'a@b.com',
      'event_1'
    );
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(db.ticketTypes.update).not.toHaveBeenCalled();
  });

  it('updates when the user owns the event', async () => {
    mockGetUser.mockResolvedValue({ uid: 'owner', email: 'o@b.com' });
    db.ticketTypes.findUnique.mockResolvedValue({ eventId: 'event_1' });
    mockCanAccess.mockResolvedValue(true);
    db.ticketTypes.update.mockResolvedValue({ eventId: 'event_1' });

    const result = await updateTicketType('ticket_1', validForm);

    expect(result).toEqual({ success: true });
    expect(db.ticketTypes.update).toHaveBeenCalledTimes(1);
    expect(db.ticketTypes.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ticket_1' } })
    );
  });
});

describe('createTicketType authorization', () => {
  it('rejects a user who does not own the event', async () => {
    mockGetUser.mockResolvedValue({ uid: 'attacker', email: 'a@b.com' });
    mockCanAccess.mockResolvedValue(false);

    const result = await createTicketType('event_1', validForm);

    expect(mockCanAccess).toHaveBeenCalledWith(
      'attacker',
      'a@b.com',
      'event_1'
    );
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(db.ticketTypes.create).not.toHaveBeenCalled();
  });
});
