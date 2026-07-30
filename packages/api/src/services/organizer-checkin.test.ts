/**
 * Unit tests for the check-in seam over a hand-rolled fake prisma (no
 * Postgres, ADR 0010). Ownership is the boundary: a foreign event or ticket is
 * NotFound, never a bypass. The atomic scan flip and the toggle's
 * stamp-vs-clear are the behaviors the routes used to own.
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from './_shared/errors';
import { scanTicket, toggleTicketCheckIn } from './organizer-checkin';

const owner: Actor = { kind: 'user', userId: 'org-1', role: 'PATRON' };

type TicketRow = {
  id: string;
  eventId: string;
  status: 'AVAILABLE' | 'VALID' | 'NOT_AVAILABLE' | 'REFUNDED' | 'CANCELLED';
  checkinTimestamp: Date | null;
  ticketType: { name: string; description: string } | null;
};
type EventRow = {
  id: string;
  organizerUserId: string;
  deletedAt: Date | null;
};

function makeFakePrisma(events: EventRow[], tickets: TicketRow[]) {
  const prisma = {
    events: {
      findFirst: async ({ where }: any) =>
        events.find(
          (e) =>
            e.id === where.id &&
            e.organizerUserId === where.organizerUserId &&
            e.deletedAt === null
        ) ?? null,
    },
    tickets: {
      findUnique: async ({ where }: any) =>
        tickets.find((t) => t.id === where.id && t.eventId === where.eventId) ??
        null,
      findFirst: async ({ where }: any) =>
        tickets.find((t) => {
          if (t.id !== where.id) return false;
          const event = events.find((e) => e.id === t.eventId);
          return (
            !!event &&
            event.organizerUserId === where.event.organizerUserId &&
            event.deletedAt === null
          );
        }) ?? null,
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const t of tickets) {
          if (
            t.id === where.id &&
            t.eventId === where.eventId &&
            where.status.in.includes(t.status) &&
            !t.checkinTimestamp
          ) {
            Object.assign(t, data);
            count++;
          }
        }
        return { count };
      },
      updateManyAndReturn: async ({ where, data }: any) => {
        const updated: TicketRow[] = [];
        for (const t of tickets) {
          if (t.id === where.id && where.status.in.includes(t.status)) {
            Object.assign(t, data);
            updated.push({ ...t });
          }
        }
        return updated;
      },
    },
  } as unknown as PrismaClient;
  return prisma;
}

const seed = (): { events: EventRow[]; tickets: TicketRow[] } => ({
  events: [
    { id: 'e1', organizerUserId: 'org-1', deletedAt: null },
    { id: 'e2', organizerUserId: 'org-2', deletedAt: null },
  ],
  tickets: [
    {
      id: 't1',
      eventId: 'e1',
      status: 'AVAILABLE',
      checkinTimestamp: null,
      ticketType: { name: 'GA', description: 'desc' },
    },
    {
      id: 't2',
      eventId: 'e2',
      status: 'AVAILABLE',
      checkinTimestamp: null,
      ticketType: null,
    },
  ],
});

describe('scanTicket', () => {
  it("throws NotFound for an event the actor doesn't own", async () => {
    const { events, tickets } = seed();
    const prisma = makeFakePrisma(events, tickets);
    await expect(
      scanTicket(prisma, owner, { ticketId: 't2', eventId: 'e2' })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(tickets[1].status).toBe('AVAILABLE');
  });

  it('throws Unauthorized for an anonymous actor', async () => {
    const { events, tickets } = seed();
    const prisma = makeFakePrisma(events, tickets);
    await expect(
      scanTicket(
        prisma,
        { kind: 'anonymous' },
        { ticketId: 't1', eventId: 'e1' }
      )
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('succeeds once then reports already-scanned on the second scan', async () => {
    const { events, tickets } = seed();
    const prisma = makeFakePrisma(events, tickets);

    const first = await scanTicket(prisma, owner, {
      ticketId: 't1',
      eventId: 'e1',
    });
    const second = await scanTicket(prisma, owner, {
      ticketId: 't1',
      eventId: 'e1',
    });

    expect(first).toEqual({
      ticketName: 'GA',
      ticketDescription: 'desc',
      scanSucceeded: true,
    });
    expect(second.scanSucceeded).toBe(false);
    expect(tickets[0].status).toBe('NOT_AVAILABLE');
    expect(tickets[0].checkinTimestamp).toBeInstanceOf(Date);
  });

  it('reports a failed scan (not an error) for an unknown ticket on an owned event', async () => {
    const { events, tickets } = seed();
    const prisma = makeFakePrisma(events, tickets);
    const result = await scanTicket(prisma, owner, {
      ticketId: 'nope',
      eventId: 'e1',
    });
    expect(result.scanSucceeded).toBe(false);
    expect(result.ticketName).toBeUndefined();
  });

  it('checks in a VALID ticket (the status the checkout mints)', async () => {
    const events = [{ id: 'e1', organizerUserId: 'org-1', deletedAt: null }];
    const tickets: TicketRow[] = [
      {
        id: 't1',
        eventId: 'e1',
        status: 'VALID',
        checkinTimestamp: null,
        ticketType: { name: 'GA', description: 'desc' },
      },
    ];
    const prisma = makeFakePrisma(events, tickets);
    const result = await scanTicket(prisma, owner, {
      ticketId: 't1',
      eventId: 'e1',
    });
    expect(result.scanSucceeded).toBe(true);
    expect(tickets[0].status).toBe('NOT_AVAILABLE');
  });

  it("names a typeless ticket 'Complementary'", async () => {
    const events = [{ id: 'e1', organizerUserId: 'org-1', deletedAt: null }];
    const tickets: TicketRow[] = [
      {
        id: 't1',
        eventId: 'e1',
        status: 'AVAILABLE',
        checkinTimestamp: null,
        ticketType: null,
      },
    ];
    const prisma = makeFakePrisma(events, tickets);
    const result = await scanTicket(prisma, owner, {
      ticketId: 't1',
      eventId: 'e1',
    });
    expect(result.ticketName).toBe('Complementary');
    expect(result.scanSucceeded).toBe(true);
  });
});

describe('toggleTicketCheckIn', () => {
  it("throws NotFound for a ticket on an event the actor doesn't own", async () => {
    const { events, tickets } = seed();
    const prisma = makeFakePrisma(events, tickets);
    await expect(
      toggleTicketCheckIn(prisma, owner, { ticketId: 't2' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('stamps checkinTimestamp when checking in', async () => {
    const { events, tickets } = seed();
    const prisma = makeFakePrisma(events, tickets);
    const updated = await toggleTicketCheckIn(prisma, owner, {
      ticketId: 't1',
    });
    expect(updated.status).toBe('NOT_AVAILABLE');
    expect(updated.checkinTimestamp).toBeInstanceOf(Date);
  });

  it('checks a VALID ticket IN (never downgrades it to AVAILABLE)', async () => {
    const { events, tickets } = seed();
    tickets[0].status = 'VALID';
    const prisma = makeFakePrisma(events, tickets);
    const updated = await toggleTicketCheckIn(prisma, owner, {
      ticketId: 't1',
    });
    expect(updated.status).toBe('NOT_AVAILABLE');
    expect(updated.checkinTimestamp).toBeInstanceOf(Date);
  });

  it('refuses a void ticket instead of resurrecting it as AVAILABLE', async () => {
    for (const voidStatus of ['REFUNDED', 'CANCELLED'] as const) {
      const { events, tickets } = seed();
      tickets[0].status = voidStatus;
      const prisma = makeFakePrisma(events, tickets);
      await expect(
        toggleTicketCheckIn(prisma, owner, { ticketId: 't1' })
      ).rejects.toBeInstanceOf(ConflictError);
      // Untouched — a scannable state would let a refunded holder through.
      expect(tickets[0].status).toBe(voidStatus);
      expect(tickets[0].checkinTimestamp).toBeNull();
    }
  });

  it('refuses when the row changed between the read and the write', async () => {
    const { events, tickets } = seed();
    const prisma = makeFakePrisma(events, tickets);
    // A competing scan won the race: the stored row is already checked in,
    // but this caller's read saw it un-checked.
    tickets[0].status = 'NOT_AVAILABLE';
    tickets[0].checkinTimestamp = new Date();
    const stale = { ...prisma } as any;
    stale.tickets = {
      ...(prisma as any).tickets,
      findFirst: async () => ({ id: 't1', status: 'AVAILABLE' }),
    };
    await expect(
      toggleTicketCheckIn(stale, owner, { ticketId: 't1' })
    ).rejects.toBeInstanceOf(ConflictError);
    // The winner's check-in survives; the loser did not clear it.
    expect(tickets[0].status).toBe('NOT_AVAILABLE');
    expect(tickets[0].checkinTimestamp).toBeInstanceOf(Date);
  });

  it('clears checkinTimestamp when undoing a check-in', async () => {
    const { events, tickets } = seed();
    tickets[0].status = 'NOT_AVAILABLE';
    tickets[0].checkinTimestamp = new Date();
    const prisma = makeFakePrisma(events, tickets);
    const updated = await toggleTicketCheckIn(prisma, owner, {
      ticketId: 't1',
    });
    expect(updated.status).toBe('AVAILABLE');
    expect(updated.checkinTimestamp).toBeNull();
  });
});
