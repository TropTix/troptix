// The actions are thin adapters over @troptix/api's ticket-type write seam —
// these tests cover the adapter's own duties: session handling (redirect
// outside try), dollars → cents at the edge, and typed-error → message
// mapping. Authorization and the paid gate are the service's tests' job.
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
jest.mock('@/server/authUser', () => ({
  getServerUser: jest.fn(),
}));
jest.mock('@/server/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@troptix/api/server', () => {
  class NotFoundError extends Error {}
  class UnauthorizedError extends Error {}
  class PaidTicketingNotEnabledError extends Error {}
  return {
    createTicketType: jest.fn(),
    updateTicketType: jest.fn(),
    toCents: (dollars: number | null | undefined) =>
      Math.round((dollars ?? 0) * 100),
    NotFoundError,
    UnauthorizedError,
    PaidTicketingNotEnabledError,
  };
});

import { redirect } from 'next/navigation';
import { getServerUser } from '@/server/authUser';
import {
  createTicketType as createService,
  updateTicketType as updateService,
  PaidTicketingNotEnabledError,
} from '@troptix/api/server';
import { createTicketType, updateTicketType } from './ticketActions';
import type { TicketTypeFormValues } from '@/lib/schemas/ticketSchema';

const mockGetUser = getServerUser as jest.Mock;
const mockCreateService = createService as jest.Mock;
const mockUpdateService = updateService as jest.Mock;

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
  mockGetUser.mockResolvedValue({ uid: 'owner', role: 'PATRON' });
});

describe('createTicketType adapter', () => {
  it('redirects without calling the service when there is no session', async () => {
    mockGetUser.mockResolvedValue(null);
    await expect(createTicketType('event_1', validForm)).rejects.toThrow(
      'NEXT_REDIRECT'
    );
    expect(redirect).toHaveBeenCalledWith('/auth/signin');
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  it('converts dollars to cents and hands the service the actor + event', async () => {
    mockCreateService.mockResolvedValue({ ticketTypeId: 't1' });
    const result = await createTicketType('event_1', validForm);

    expect(result).toEqual({ success: true });
    const [, actor, eventId, input] = mockCreateService.mock.calls[0];
    expect(actor).toMatchObject({ kind: 'user', userId: 'owner' });
    expect(eventId).toBe('event_1');
    expect(input).toMatchObject({
      priceCents: 1000,
      name: 'General Admission',
    });
  });

  it('maps the paid gate to a friendly message', async () => {
    mockCreateService.mockRejectedValue(new PaidTicketingNotEnabledError());
    const result = await createTicketType('event_1', validForm);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Paid tickets need approval');
  });
});

describe('updateTicketType adapter', () => {
  it('passes event + ticket ids through to the service', async () => {
    mockUpdateService.mockResolvedValue(undefined);
    const result = await updateTicketType('event_1', 'ticket_1', validForm);

    expect(result).toEqual({ success: true });
    const [, , eventId, ticketTypeId, input] = mockUpdateService.mock.calls[0];
    expect(eventId).toBe('event_1');
    expect(ticketTypeId).toBe('ticket_1');
    expect(input).toMatchObject({ priceCents: 1000 });
  });

  it('rejects invalid form data before touching the session or service', async () => {
    const result = await updateTicketType('event_1', 'ticket_1', {
      ...validForm,
      name: 'x',
    });
    expect(result).toEqual({
      success: false,
      error: 'Invalid form data provided.',
    });
    expect(mockUpdateService).not.toHaveBeenCalled();
  });
});
