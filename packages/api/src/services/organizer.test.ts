import type { PrismaClient } from '@troptix/db';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../trpc/context';
import { checkInTicket } from './organizer';

type MockPrismaOptions = {
  ticket?: any;
};

function fakePrisma(opts: MockPrismaOptions): PrismaClient {
  return {
    tickets: {
      findUnique: async () => opts.ticket ?? null,
      updateMany: async ({ where }: any) => ({
        count:
          opts.ticket &&
          opts.ticket.status === where.status &&
          !opts.ticket.checkinTimestamp
            ? 1
            : 0,
      }),
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
});
