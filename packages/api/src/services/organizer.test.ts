import type { PrismaClient } from '@troptix/db';
import { describe, expect, it } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import type { Actor } from '../trpc/context';
import { checkInTicket, undoCheckInTicket } from './organizer';

type MockPrismaOptions = {
  ticket?: any;
};

function fakePrisma(opts: MockPrismaOptions): PrismaClient {
  return fromPartial<PrismaClient>({
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
  });
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
        event: { organizerUserId: 'org-2' },
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
        event: { organizerUserId: 'org-1' },
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
        event: { organizerUserId: 'org-1' },
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
        event: { organizerUserId: 'org-1' },
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
        event: { organizerUserId: 'org-1' },
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
          event: { organizerUserId: 'org-1' },
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
        event: { organizerUserId: 'org-1' },
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
        event: { organizerUserId: 'org-2' },
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
        event: { organizerUserId: 'org-1' },
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
        event: { organizerUserId: 'org-1' },
      },
    });
    const res = await undoCheckInTicket(prisma, mockActor, 't-1');
    expect(res).toEqual({ success: true });
  });
});
