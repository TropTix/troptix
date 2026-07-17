/**
 * Unit tests for the read-side checkout services. Unlike reservations.test.ts
 * these need NO Postgres — the services are pure over an injected `prisma`, so
 * we hand them a hand-rolled fake that returns canned rows and assert the
 * mapping / sorting / gating / fee logic (ADR 0010).
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import { applyCode, getCheckoutConfig } from './checkout';

// A wide-open sale window around "now" so tickets are active by default.
const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 86_400_000);

type Row = {
  id: string;
  name: string;
  description: string;
  maxPurchasePerUser: number;
  ticketingFees: 'PASS_TICKET_FEES' | 'ABSORB_TICKET_FEES';
  ticketType: 'FREE' | 'PAID' | 'COMPLEMENTARY' | null;
  capacity: number | null;
  reserved: number;
  sold: number;
  priceCents: number | null;
  quantity: number;
  price: number;
  saleStartsAt: Date;
  saleEndsAt: Date;
  event: { isDraft: boolean };
};

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'tt-1',
    name: 'General Admission',
    description: 'GA',
    maxPurchasePerUser: 10,
    ticketingFees: 'PASS_TICKET_FEES',
    ticketType: 'PAID',
    capacity: 100,
    reserved: 0,
    sold: 0,
    priceCents: 5000,
    quantity: 100,
    price: 50,
    saleStartsAt: PAST,
    saleEndsAt: FUTURE,
    event: { isDraft: false },
    ...overrides,
  };
}

/** Minimal PrismaClient stand-in exposing only what the services touch. */
function fakePrisma(opts: {
  ticketTypes?: Row[];
  matchedTicketType?: Row | null;
  eventCount?: number;
}): PrismaClient {
  return {
    ticketTypes: {
      findMany: async () => opts.ticketTypes ?? [],
      findFirst: async () => opts.matchedTicketType ?? null,
    },
    events: {
      count: async () => opts.eventCount ?? 0,
    },
  } as unknown as PrismaClient;
}

/** Run getCheckoutConfig over a single ticket-type row and return the mapped ticket. */
async function firstTicket(ticketType: Row) {
  const { tickets } = await getCheckoutConfig(
    fakePrisma({ ticketTypes: [ticketType] }),
    { eventId: 'evt-1' }
  );
  return tickets[0];
}

describe('getCheckoutConfig', () => {
  it('maps a ticket type to the cents contract', async () => {
    const prisma = fakePrisma({ ticketTypes: [row()] });
    const { tickets } = await getCheckoutConfig(prisma, { eventId: 'evt-1' });

    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      id: 'tt-1',
      priceCents: 5000,
      // 5000*0.08 + 50 = 450 fee (no tax). Literal, not calculateFeesCents(5000),
      // so a wrong fee formula can't pass on both sides.
      feesCents: 450,
      maxAllowedToAdd: 10, // min(availability 100, maxPurchasePerUser 10)
      feeStructure: 'PASS_TICKET_FEES',
      ticketType: 'PAID',
      ticketQuantityLow: false,
    });
    expect(tickets[0].saleStartsAt).toBe(PAST.toISOString());
    expect(tickets[0].isPasswordProtected).toBeUndefined();
  });

  it('nets active holds out of availability via reserved + sold', async () => {
    // capacity 12 − reserved 3 − sold 4 = 5 available → low (<10), clamped.
    const ticket = await firstTicket(
      row({ capacity: 12, reserved: 3, sold: 4 })
    );
    expect(ticket.maxAllowedToAdd).toBe(5);
    expect(ticket.ticketQuantityLow).toBe(true);
  });

  it('charges no fee when the organizer absorbs fees', async () => {
    const ticket = await firstTicket(
      row({ ticketingFees: 'ABSORB_TICKET_FEES' })
    );
    expect(ticket.feesCents).toBe(0);
  });

  it('blocks adds for draft events and closed sale windows', async () => {
    expect(
      (await firstTicket(row({ event: { isDraft: true } }))).maxAllowedToAdd
    ).toBe(0);
    expect(
      (await firstTicket(row({ saleStartsAt: FUTURE, saleEndsAt: FUTURE })))
        .maxAllowedToAdd
    ).toBe(0);
    expect(
      (await firstTicket(row({ saleStartsAt: PAST, saleEndsAt: PAST })))
        .maxAllowedToAdd
    ).toBe(0);
  });

  it('sorts available tickets before sold-out, then by ascending price', async () => {
    const prisma = fakePrisma({
      ticketTypes: [
        row({ id: 'cheap-soldout', priceCents: 1000, capacity: 0 }),
        row({ id: 'pricey', priceCents: 9000 }),
        row({ id: 'cheap', priceCents: 2000 }),
      ],
    });
    const { tickets } = await getCheckoutConfig(prisma, { eventId: 'evt-1' });
    expect(tickets.map((t) => t.id)).toEqual([
      'cheap',
      'pricey',
      'cheap-soldout',
    ]);
  });

  it('falls back to legacy columns before backfill', async () => {
    const ticket = await firstTicket(
      row({
        priceCents: null,
        price: 42,
        capacity: null,
        quantity: 7, // → availability 7, low
      })
    );
    expect(ticket.priceCents).toBe(4200);
    expect(ticket.ticketQuantityLow).toBe(true);
    expect(ticket.maxAllowedToAdd).toBe(7);
  });

  it('returns an empty list for an event with no public tickets', async () => {
    const prisma = fakePrisma({ ticketTypes: [], eventCount: 1 });
    expect(await getCheckoutConfig(prisma, { eventId: 'evt-1' })).toEqual({
      tickets: [],
    });
  });

  it('throws NotFoundError when the event does not exist', async () => {
    const prisma = fakePrisma({ ticketTypes: [], eventCount: 0 });
    await expect(
      getCheckoutConfig(prisma, { eventId: 'missing' })
    ).rejects.toThrow('Event with ID missing not found.');
  });
});

describe('applyCode', () => {
  it('unlocks a matched code-gated ticket', async () => {
    const prisma = fakePrisma({
      matchedTicketType: row({ id: 'vip', name: 'VIP', priceCents: 15000 }),
    });
    const res = await applyCode(prisma, { eventId: 'evt-1', code: 'SECRET' });

    expect(res.type).toBe('password');
    expect(res.isValid).toBe(true);
    if (res.type === 'password') {
      expect(res.unlockedTicket.id).toBe('vip');
      expect(res.unlockedTicket.priceCents).toBe(15000);
      expect(res.unlockedTicket.isPasswordProtected).toBe(true);
    }
  });

  it('returns an invalid result when no ticket matches the code', async () => {
    const prisma = fakePrisma({ matchedTicketType: null });
    const res = await applyCode(prisma, { eventId: 'evt-1', code: 'NOPE' });
    expect(res).toEqual({
      type: 'invalid',
      isValid: false,
      message: 'Invalid code.',
    });
  });
});
