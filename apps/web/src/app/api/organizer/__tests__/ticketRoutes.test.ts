/**
 * @jest-environment node
 */
jest.mock('next/headers', () => ({
  headers: jest.fn(async () => ({
    get: (k: string) => (k === 'authorization' ? 'Bearer tok' : null),
  })),
}));
jest.mock('@/server/authUser', () => ({
  getUserFromIdTokenCookie: jest.fn(),
}));
jest.mock('@/server/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@troptix/api/server', () => {
  class NotFoundError extends Error {}
  class ConflictError extends Error {}
  return {
    scanTicket: jest.fn(),
    toggleTicketCheckIn: jest.fn(),
    NotFoundError,
    ConflictError,
  };
});

import { getUserFromIdTokenCookie } from '@/server/authUser';
import {
  scanTicket,
  toggleTicketCheckIn,
  NotFoundError as FakeNotFoundError,
  ConflictError as FakeConflictError,
} from '@troptix/api/server';
import { PUT as scanPUT } from '../tickets/scan/route';
import { PUT as checkInPUT } from '../tickets/check-in/route';

const mockGetUser = getUserFromIdTokenCookie as jest.Mock;
const mockScan = scanTicket as unknown as jest.Mock;
const mockToggle = toggleTicketCheckIn as unknown as jest.Mock;

const req = (body: unknown) => ({ json: async () => body }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetUser.mockResolvedValue({
    uid: 'owner',
    email: 'o@example.com',
    role: 'PATRON',
    isPlatformOwner: false,
  });
});

describe('scan route', () => {
  it('maps the service NotFound (foreign event) to 404', async () => {
    mockScan.mockRejectedValue(new FakeNotFoundError('Event not found'));

    const res = await scanPUT(req({ ticketId: 't1', eventId: 'e1' }));

    expect(res.status).toBe(404);
  });

  it('passes the scan result through and acts as the caller', async () => {
    mockScan.mockResolvedValue({
      ticketName: 'GA',
      ticketDescription: 'desc',
      scanSucceeded: true,
    });

    const res = await scanPUT(req({ ticketId: 't1', eventId: 'e1' }));
    const body = await res.json();

    expect(body).toEqual({
      ticketName: 'GA',
      ticketDescription: 'desc',
      scanSucceeded: true,
    });
    expect(mockScan.mock.calls[0][1]).toEqual({
      kind: 'user',
      userId: 'owner',
      role: 'PATRON',
    });
    expect(mockScan.mock.calls[0][2]).toEqual({
      ticketId: 't1',
      eventId: 'e1',
    });
  });

  it('rejects a malformed body with 400 before touching the service', async () => {
    const res = await scanPUT(req({ ticketId: 't1' }));

    expect(res.status).toBe(400);
    expect(mockScan).not.toHaveBeenCalled();
  });

  it('rejects a missing token with 401', async () => {
    const { headers } = jest.requireMock('next/headers');
    headers.mockResolvedValueOnce({ get: () => null });

    const res = await scanPUT(req({ ticketId: 't1', eventId: 'e1' }));

    expect(res.status).toBe(401);
    expect(mockScan).not.toHaveBeenCalled();
  });
});

describe('check-in route', () => {
  it('maps the service NotFound (foreign or missing ticket) to 404', async () => {
    mockToggle.mockRejectedValue(new FakeNotFoundError('Ticket not found'));

    const res = await checkInPUT(req({ ticketId: 't1' }));

    expect(res.status).toBe(404);
  });

  it('returns the updated ticket from the service', async () => {
    const updated = {
      id: 't1',
      status: 'NOT_AVAILABLE',
      checkinTimestamp: new Date().toISOString(),
    };
    mockToggle.mockResolvedValue(updated);

    const res = await checkInPUT(req({ ticketId: 't1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('t1');
    expect(body.status).toBe('NOT_AVAILABLE');
    expect(mockToggle.mock.calls[0][2]).toEqual({ ticketId: 't1' });
  });

  it('maps a service ConflictError to 409 with its message', async () => {
    mockToggle.mockRejectedValue(
      new FakeConflictError('This ticket is not valid for entry')
    );

    const res = await checkInPUT(req({ ticketId: 't1' }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('This ticket is not valid for entry');
  });

  it('rejects a malformed body with 400', async () => {
    const res = await checkInPUT(req({}));

    expect(res.status).toBe(400);
    expect(mockToggle).not.toHaveBeenCalled();
  });
});
