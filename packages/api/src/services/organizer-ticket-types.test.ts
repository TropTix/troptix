/**
 * Unit tests for the Screen E ticket-types read. Pure over an injected fake
 * `prisma` (ADR 0010). Covers the shared authorization seam, the sale-window
 * states, the priceCents fallback, per-ticket-type revenue, and the summary totals.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { listTicketTypes } from './organizer-ticket-types';
import { getSaleState } from './_shared/saleState';
import { NotFoundError, UnauthorizedError } from './_shared/errors';

const NOW = new Date('2026-07-15T12:00:00Z');
const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };
const ADMIN: Actor = { kind: 'user', userId: 'admin-1', role: 'PATRON' };

const ticketType = (over: Record<string, unknown> = {}) => ({
  id: 't-ga',
  name: 'GA',
  price: 20,
  priceCents: 2000,
  capacity: 100,
  sold: 40,
  saleStartsAt: new Date('2026-07-01T00:00:00Z'),
  saleEndsAt: new Date('2026-07-31T00:00:00Z'),
  ticketingFees: 'PASS_TICKET_FEES',
  ...over,
});

function fakePrisma(
  opts: {
    email?: string;
    event?: unknown; // undefined → owned with one ticketType; null → not found
    ticketTypes?: unknown[];
    revenue?: unknown[];
  } = {}
) {
  const eventsFindFirst = vi
    .fn()
    .mockResolvedValue(
      opts.event === undefined
        ? { id: 'e1', ticketTypes: opts.ticketTypes ?? [ticketType()] }
        : opts.event
    );
  const ticketsGroupBy = vi.fn().mockResolvedValue(opts.revenue ?? []);

  const prisma = {
    users: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          opts.email === undefined
            ? { email: 'o@b.com' }
            : { email: opts.email }
        ),
    },
    events: { findFirst: eventsFindFirst },
    tickets: { groupBy: ticketsGroupBy },
  } as unknown as PrismaClient;

  return { prisma, eventsFindFirst, ticketsGroupBy };
}

const revenue = (ticketTypeId: string, subtotal: number | null) => ({
  ticketTypeId,
  _sum: { subtotal },
});

describe('getSaleState', () => {
  const window = {
    saleStartsAt: new Date('2026-07-10T00:00:00Z'),
    saleEndsAt: new Date('2026-07-20T00:00:00Z'),
  };

  it('is Scheduled before the window opens', () => {
    expect(getSaleState(window, new Date('2026-07-01T00:00:00Z'))).toBe(
      'Scheduled'
    );
  });

  it('is OnSale inside the window, including its edges', () => {
    expect(getSaleState(window, NOW)).toBe('OnSale');
    expect(getSaleState(window, window.saleStartsAt)).toBe('OnSale');
    expect(getSaleState(window, window.saleEndsAt)).toBe('OnSale');
  });

  it('is Ended after the window closes', () => {
    expect(getSaleState(window, new Date('2026-08-01T00:00:00Z'))).toBe(
      'Ended'
    );
  });
});

describe('listTicketTypes — authorization', () => {
  it('rejects an anonymous actor', async () => {
    const { prisma } = fakePrisma();
    await expect(
      listTicketTypes(prisma, { kind: 'anonymous' }, 'e1')
    ).rejects.toThrow(UnauthorizedError);
  });

  it('scopes the event fetch to the acting organizer', async () => {
    const { prisma, eventsFindFirst } = fakePrisma();
    await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
    expect(eventsFindFirst.mock.calls[0][0].where).toMatchObject({
      id: 'e1',
      organizerUserId: 'owner-1',
      deletedAt: null,
    });
  });

  it('throws NotFound for an event the organizer doesn’t own', async () => {
    const { prisma } = fakePrisma({ event: null });
    await expect(listTicketTypes(prisma, OWNER, 'e1', {}, NOW)).rejects.toThrow(
      NotFoundError
    );
  });

  it('honors View-as for a platform owner', async () => {
    const { prisma, eventsFindFirst } = fakePrisma({
      email: 'staff@usetroptix.com',
    });
    await listTicketTypes(
      prisma,
      ADMIN,
      'e1',
      { viewAsOrganizerUserId: 'target' },
      NOW
    );
    expect(eventsFindFirst.mock.calls[0][0].where.organizerUserId).toBe(
      'target'
    );
  });
});

describe('listTicketTypes — shaping', () => {
  it('shapes a ticketType with its counters, price, sale state, and revenue', async () => {
    const { prisma } = fakePrisma({ revenue: [revenue('t-ga', 800)] });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);

    expect(result.ticketTypes).toEqual([
      {
        id: 't-ga',
        name: 'GA',
        // $20.00 set; the attendee pays 8% + $0.50 on top (PASS).
        grossPriceCents: 2000,
        displayPriceCents: 2210,
        sold: 40,
        capacity: 100,
        revenueCents: 80000,
        saleState: 'OnSale',
        saleStartsAt: '2026-07-01T00:00:00.000Z',
        saleEndsAt: '2026-07-31T00:00:00.000Z',
      },
    ]);
  });

  it('falls back to the legacy float price when priceCents is null', async () => {
    const { prisma } = fakePrisma({
      ticketTypes: [ticketType({ priceCents: null, price: 12.5 })],
    });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
    expect(result.ticketTypes[0].grossPriceCents).toBe(1250);
  });

  it('absorbs the fee instead of adding it when the type absorbs fees', async () => {
    const { prisma } = fakePrisma({
      ticketTypes: [ticketType({ ticketingFees: 'ABSORB_TICKET_FEES' })],
    });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
    // The attendee pays the sticker price; the organizer eats the fee.
    expect(result.ticketTypes[0].displayPriceCents).toBe(2000);
    expect(result.ticketTypes[0].grossPriceCents).toBe(2000);
  });

  it('charges no fee on a free type, whichever fee structure it carries', async () => {
    for (const fees of ['PASS_TICKET_FEES', 'ABSORB_TICKET_FEES']) {
      const { prisma } = fakePrisma({
        ticketTypes: [
          ticketType({ price: 0, priceCents: 0, ticketingFees: fees }),
        ],
      });
      const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
      expect(result.ticketTypes[0]).toMatchObject({
        grossPriceCents: 0,
        displayPriceCents: 0,
      });
    }
  });

  it('reports zero revenue for a ticketType with no completed tickets', async () => {
    const { prisma } = fakePrisma({ revenue: [] });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
    expect(result.ticketTypes[0].revenueCents).toBe(0);
  });

  it('derives each ticketType’s sale state independently', async () => {
    const { prisma } = fakePrisma({
      ticketTypes: [
        ticketType({
          id: 'early',
          saleEndsAt: new Date('2026-07-05T00:00:00Z'),
        }),
        ticketType({ id: 'now' }),
        ticketType({
          id: 'later',
          saleStartsAt: new Date('2026-08-01T00:00:00Z'),
          saleEndsAt: new Date('2026-08-10T00:00:00Z'),
        }),
      ],
    });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
    expect(result.ticketTypes.map((t) => [t.id, t.saleState])).toEqual([
      ['early', 'Ended'],
      ['now', 'OnSale'],
      ['later', 'Scheduled'],
    ]);
  });

  it('summarises sold, capacity and revenue as the sum of the rows', async () => {
    const { prisma } = fakePrisma({
      ticketTypes: [
        ticketType({ id: 't-ga', sold: 40, capacity: 100 }),
        ticketType({ id: 't-vip', sold: 5, capacity: 20 }),
      ],
      revenue: [revenue('t-ga', 800), revenue('t-vip', 250)],
    });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);

    expect(result.summary).toEqual({
      sold: 45,
      capacity: 120,
      revenueCents: 105000,
      onSale: 2,
    });
    // The header must equal the rows it sits above.
    expect(result.summary.revenueCents).toBe(
      result.ticketTypes.reduce((n, t) => n + t.revenueCents, 0)
    );
  });

  it('returns an empty view for an event with no ticketTypes', async () => {
    const { prisma } = fakePrisma({ ticketTypes: [] });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
    expect(result.ticketTypes).toEqual([]);
    expect(result.summary).toEqual({
      sold: 0,
      capacity: 0,
      revenueCents: 0,
      onSale: 0,
    });
  });
});
