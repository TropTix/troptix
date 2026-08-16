import type { PrismaClient } from '@troptix/db';
import { describe, expect, it } from 'vitest';
import { createContext } from '../context';
import { createCaller } from './index';

type MockPrismaOptions = {
  ticket?: any;
  events?: any[];
};

function fakePrisma(opts: MockPrismaOptions): PrismaClient {
  return {
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
    events: {
      findMany: async () => opts.events ?? [],
    },
  } as unknown as PrismaClient;
}

function caller(prisma: PrismaClient) {
  return createCaller({
    ...createContext({ prisma }),
    actor: { kind: 'user', userId: 'org-1', role: 'ORGANIZER' },
  });
}

describe('appRouter.organizer (via createCaller)', () => {
  it('checkInTicket returns success for a valid available ticket', async () => {
    const res = await caller(
      fakePrisma({
        ticket: {
          id: 't-1',
          status: 'AVAILABLE',
          event: { organizerUserId: 'org-1' },
        },
      })
    ).organizer.checkInTicket({ ticketId: 't-1' });

    expect(res).toEqual({ success: true });
  });

  it('rejects invalid input at the boundary (empty ticketId)', async () => {
    await expect(
      (caller(fakePrisma({})).organizer.checkInTicket as any)({})
    ).rejects.toThrow();
  });

  it('checkInTicket throws CONFLICT (ALREADY_CHECKED_IN) when ticket is unavailable', async () => {
    await expect(
      caller(
        fakePrisma({
          ticket: {
            id: 't-1',
            status: 'NOT_AVAILABLE',
            event: { organizerUserId: 'org-1' },
          },
        })
      ).organizer.checkInTicket({ ticketId: 't-1' })
    ).rejects.toThrow('Ticket already checked in');
  });

  it('checkInTicket throws UNAUTHORIZED for another organizers event', async () => {
    await expect(
      caller(
        fakePrisma({
          ticket: {
            id: 't-1',
            status: 'AVAILABLE',
            event: { organizerUserId: 'org-2' },
          },
        })
      ).organizer.checkInTicket({ ticketId: 't-1' })
    ).rejects.toThrow('UNAUTHORIZED');
  });

  it('undoCheckInTicket returns success for a checked in ticket', async () => {
    const res = await caller(
      fakePrisma({
        ticket: {
          id: 't-1',
          status: 'AVAILABLE',
          checkinTimestamp: new Date(),
          event: { organizerUserId: 'org-1' },
        },
      })
    ).organizer.undoCheckInTicket({ ticketId: 't-1' });

    expect(res).toEqual({ success: true });
  });

  it('undoCheckInTicket throws CONFLICT when ticket is not checked in', async () => {
    await expect(
      caller(
        fakePrisma({
          ticket: {
            id: 't-1',
            status: 'AVAILABLE',
            checkinTimestamp: null,
            event: { organizerUserId: 'org-1' },
          },
        })
      ).organizer.undoCheckInTicket({ ticketId: 't-1' })
    ).rejects.toThrow('Ticket is not checked in');
  });
});
