import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import { checkInTicket } from './organizer';
import type { Actor } from '../trpc/context';

type MockPrismaOptions = {
  userEmail?: string;
  ticket?: any;
};

function fakePrisma(opts: MockPrismaOptions): PrismaClient {
  return {
    users: {
      findUnique: async () => ({ email: opts.userEmail ?? 'org@example.com' }),
    },
    tickets: {
      findUnique: async () => opts.ticket ?? null,
      update: async (args: any) => ({ ...opts.ticket, ...args.data }),
    },
  } as unknown as PrismaClient;
}

const mockActor: Actor = { kind: 'user', userId: 'org-1' };

describe('checkInTicket', () => {
  it('throws NOT_FOUND if ticket does not exist', async () => {
    const prisma = fakePrisma({ ticket: null });
    await expect(checkInTicket(prisma, mockActor, 't-1')).rejects.toThrow(
      'NOT_FOUND'
    );
  });

  it('throws UNAUTHORIZED if actor is not the event organizer or platform owner', async () => {
    const prisma = fakePrisma({
      userEmail: 'random@example.com',
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

  it('allows platform owner to check in any ticket', async () => {
    const prisma = fakePrisma({
      userEmail: 'admin@usetroptix.com', // platform owner
      ticket: {
        id: 't-1',
        status: 'AVAILABLE',
        event: { organizerUserId: 'org-2' }, // different org
      },
    });
    const res = await checkInTicket(prisma, mockActor, 't-1');
    expect(res).toEqual({ success: true });
  });

  it('throws ALREADY_CHECKED_IN if ticket is NOT_AVAILABLE', async () => {
    const prisma = fakePrisma({
      userEmail: 'org@example.com',
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
      userEmail: 'org@example.com',
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
      userEmail: 'org@example.com',
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
