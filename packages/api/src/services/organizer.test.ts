import type { PrismaClient } from '@troptix/db';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../trpc/context';
import type { MembershipRole } from '@troptix/db';
import { checkInTicket, getEvent, undoCheckInTicket } from './organizer';

type MockPrismaOptions = {
  ticket?: any;
};

function fakePrisma(opts: MockPrismaOptions): PrismaClient {
  return {
    membership: {
      findFirst: async ({ where }: any) => {
        const role = opts.ticket?.members?.[where.userId];
        return role ? { role } : null;
      },
    },
    tickets: {
      findUnique: async () => opts.ticket ?? null,
      updateMany: async ({ where }: any) => {
        if (where.checkinTimestamp?.not !== undefined) {
          return {
            count: opts.ticket && opts.ticket.checkinTimestamp ? 1 : 0,
          };
        }
        return {
          count:
            opts.ticket &&
            where.status?.in?.includes(opts.ticket.status) &&
            !opts.ticket.checkinTimestamp
              ? 1
              : 0,
        };
      },
    },
  } as unknown as PrismaClient;
}

const mockActor: Actor = { kind: 'user', userId: 'org-1', role: 'ORGANIZER' };

describe('checkInTicket', () => {
  it('throws NOT_FOUND if ticket does not exist', async () => {
    const prisma = fakePrisma({ ticket: null });
    await expect(checkInTicket(prisma, mockActor, 't-1')).rejects.toThrow(
      'NOT_FOUND'
    );
  });

  it('throws UNAUTHORIZED if actor is not the event organizer', async () => {
    const prisma = fakePrisma({
      ticket: {
        id: 't-1',
        status: 'AVAILABLE',
        eventId: 'e-1',
        members: { 'org-2': 'OWNER' },
      },
    });
    await expect(checkInTicket(prisma, mockActor, 't-1')).rejects.toThrow(
      'UNAUTHORIZED'
    );
  });

  it('throws UNAUTHORIZED for an anonymous actor', async () => {
    const prisma = fakePrisma({
      ticket: {
        id: 't-1',
        status: 'AVAILABLE',
        eventId: 'e-1',
        members: { 'org-1': 'OWNER' },
      },
    });
    await expect(
      checkInTicket(prisma, { kind: 'anonymous' }, 't-1')
    ).rejects.toThrow('UNAUTHORIZED');
  });

  it('throws ALREADY_CHECKED_IN if ticket is NOT_AVAILABLE', async () => {
    const prisma = fakePrisma({
      ticket: {
        id: 't-1',
        status: 'NOT_AVAILABLE',
        eventId: 'e-1',
        members: { 'org-1': 'OWNER' },
      },
    });
    await expect(checkInTicket(prisma, mockActor, 't-1')).rejects.toThrow(
      'ALREADY_CHECKED_IN'
    );
  });

  it('throws ALREADY_CHECKED_IN if ticket has a checkinTimestamp', async () => {
    const prisma = fakePrisma({
      ticket: {
        id: 't-1',
        status: 'AVAILABLE',
        checkinTimestamp: new Date(),
        eventId: 'e-1',
        members: { 'org-1': 'OWNER' },
      },
    });
    await expect(checkInTicket(prisma, mockActor, 't-1')).rejects.toThrow(
      'ALREADY_CHECKED_IN'
    );
  });

  it('successfully checks in an available ticket', async () => {
    const prisma = fakePrisma({
      ticket: {
        id: 't-1',
        status: 'AVAILABLE',
        eventId: 'e-1',
        members: { 'org-1': 'OWNER' },
      },
    });
    const res = await checkInTicket(prisma, mockActor, 't-1');
    expect(res).toEqual({ success: true });
  });

  it('reports a void ticket as not valid, not as already checked in', async () => {
    for (const voidStatus of ['REFUNDED', 'CANCELLED', 'USED'] as const) {
      const prisma = fakePrisma({
        ticket: {
          id: 't-1',
          status: voidStatus,
          eventId: 'e-1',
          members: { 'org-1': 'OWNER' },
        },
      });
      await expect(checkInTicket(prisma, mockActor, 't-1')).rejects.toThrow(
        'TICKET_NOT_VALID'
      );
    }
  });

  it('successfully checks in a VALID ticket (the status the checkout mints)', async () => {
    const prisma = fakePrisma({
      ticket: {
        id: 't-1',
        status: 'VALID',
        eventId: 'e-1',
        members: { 'org-1': 'OWNER' },
      },
    });
    const res = await checkInTicket(prisma, mockActor, 't-1');
    expect(res).toEqual({ success: true });
  });
});

describe('undoCheckInTicket', () => {
  it('throws NOT_FOUND if ticket does not exist', async () => {
    const prisma = fakePrisma({ ticket: null });
    await expect(undoCheckInTicket(prisma, mockActor, 't-1')).rejects.toThrow(
      'NOT_FOUND'
    );
  });

  it('throws UNAUTHORIZED if actor is not the event organizer', async () => {
    const prisma = fakePrisma({
      ticket: {
        id: 't-1',
        status: 'AVAILABLE',
        eventId: 'e-1',
        members: { 'org-2': 'OWNER' },
      },
    });
    await expect(undoCheckInTicket(prisma, mockActor, 't-1')).rejects.toThrow(
      'UNAUTHORIZED'
    );
  });

  it('throws NOT_CHECKED_IN if ticket has no checkinTimestamp', async () => {
    const prisma = fakePrisma({
      ticket: {
        id: 't-1',
        status: 'AVAILABLE',
        checkinTimestamp: null,
        eventId: 'e-1',
        members: { 'org-1': 'OWNER' },
      },
    });
    await expect(undoCheckInTicket(prisma, mockActor, 't-1')).rejects.toThrow(
      'NOT_CHECKED_IN'
    );
  });

  it('successfully clears checkinTimestamp for a checked-in ticket', async () => {
    const prisma = fakePrisma({
      ticket: {
        id: 't-1',
        status: 'AVAILABLE',
        checkinTimestamp: new Date(),
        eventId: 'e-1',
        members: { 'org-1': 'OWNER' },
      },
    });
    const res = await undoCheckInTicket(prisma, mockActor, 't-1');
    expect(res).toEqual({ success: true });
  });
});

describe('getEvent', () => {
  function eventPrisma(role: MembershipRole | null): PrismaClient {
    return {
      membership: {
        findFirst: async () => (role ? { role } : null),
      },
      events: {
        findUnique: async () => ({
          id: 'e-1',
          name: 'Show',
          startsAt: new Date('2026-10-01T22:00:00Z'),
          venue: 'Hall',
          address: '1 Main St, Kingston',
          tickets: [
            {
              id: 't-1',
              firstName: 'Ana',
              lastName: 'Diaz',
              email: 'ana@example.com',
              checkinTimestamp: null,
              ticketType: { name: 'GA' },
              ticketsType: 'PAID',
            },
          ],
        }),
      },
    } as unknown as PrismaClient;
  }

  it('shows guest emails to the Owner', async () => {
    const event = await getEvent(eventPrisma('OWNER'), mockActor, 'e-1');
    expect(event.guests[0]?.email).toBe('ana@example.com');
  });

  it('gives a Scanner the door slice without emails', async () => {
    const event = await getEvent(eventPrisma('SCANNER'), mockActor, 'e-1');
    expect(event.guests[0]).toMatchObject({
      name: 'Ana Diaz',
      ticketType: 'GA',
    });
    expect(event.guests[0]?.email).toBeUndefined();
  });

  it('throws UNAUTHORIZED without a Membership', async () => {
    await expect(getEvent(eventPrisma(null), mockActor, 'e-1')).rejects.toThrow(
      'UNAUTHORIZED'
    );
  });
});
