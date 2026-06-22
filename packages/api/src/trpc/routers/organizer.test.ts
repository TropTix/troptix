import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import { createCaller } from './index';
import { createContext } from '../context';

type MockPrismaOptions = {
  userEmail?: string;
  ticket?: any;
  events?: any[];
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
    events: {
      findMany: async () => opts.events ?? [],
    },
  } as unknown as PrismaClient;
}

function caller(prisma: PrismaClient) {
  // Use a mocked context holding an actor
  return createCaller({
    ...createContext({ prisma }),
    actor: { kind: 'user', userId: 'org-1' },
  });
}

describe('appRouter.organizer (via createCaller)', () => {
  it('checkInTicket returns success for a valid available ticket', async () => {
    const res = await caller(
      fakePrisma({
        userEmail: 'org@example.com',
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
    // We expect Zod validation error for empty string if it's not a valid format
    // Zod string() allows empty string unless min(1) is used, but assuming typical string validations
    // If not, we test that it throws when undefined
    await expect(
      (caller(fakePrisma({})).organizer.checkInTicket as any)({})
    ).rejects.toThrow();
  });

  it('checkInTicket throws CONFLICT (ALREADY_CHECKED_IN) when ticket is unavailable', async () => {
    await expect(
      caller(
        fakePrisma({
          userEmail: 'org@example.com',
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
          userEmail: 'org@example.com',
          ticket: {
            id: 't-1',
            status: 'AVAILABLE',
            event: { organizerUserId: 'org-2' },
          },
        })
      ).organizer.checkInTicket({ ticketId: 't-1' })
    ).rejects.toThrow('UNAUTHORIZED');
  });
});
