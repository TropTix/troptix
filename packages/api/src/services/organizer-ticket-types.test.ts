/**
 * Unit tests for the Screen E ticket-types read. Pure over an injected fake
 * `prisma` (ADR 0010). Covers the shared authorization seam, the sale-window
 * states, the priceCents fallback, per-tier revenue, and the summary totals.
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

const tier = (over: Record<string, unknown> = {}) => ({
  id: 't-ga',
  name: 'GA',
  price: 20,
  priceCents: 2000,
  capacity: 100,
  sold: 40,
  saleStartsAt: new Date('2026-07-01T00:00:00Z'),
  saleEndsAt: new Date('2026-07-31T00:00:00Z'),
  ...over,
});

function fakePrisma(
  opts: {
    email?: string;
    event?: unknown; // undefined → owned with one tier; null → not found
    tiers?: unknown[];
    revenue?: unknown[];
  } = {}
) {
  const eventsFindFirst = vi
    .fn()
    .mockResolvedValue(
      opts.event === undefined
        ? { id: 'e1', ticketTypes: opts.tiers ?? [tier()] }
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
  it('shapes a tier with its counters, price, sale state, and revenue', async () => {
    const { prisma } = fakePrisma({ revenue: [revenue('t-ga', 800)] });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);

    expect(result.tiers).toEqual([
      {
        id: 't-ga',
        name: 'GA',
        priceCents: 2000,
        sold: 40,
        capacity: 100,
        revenueCents: 80000,
        saleState: 'OnSale',
      },
    ]);
  });

  it('falls back to the legacy float price when priceCents is null', async () => {
    const { prisma } = fakePrisma({
      tiers: [tier({ priceCents: null, price: 12.5 })],
    });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
    expect(result.tiers[0].priceCents).toBe(1250);
  });

  it('reports zero revenue for a tier with no completed tickets', async () => {
    const { prisma } = fakePrisma({ revenue: [] });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
    expect(result.tiers[0].revenueCents).toBe(0);
  });

  it('derives each tier’s sale state independently', async () => {
    const { prisma } = fakePrisma({
      tiers: [
        tier({ id: 'early', saleEndsAt: new Date('2026-07-05T00:00:00Z') }),
        tier({ id: 'now' }),
        tier({
          id: 'later',
          saleStartsAt: new Date('2026-08-01T00:00:00Z'),
          saleEndsAt: new Date('2026-08-10T00:00:00Z'),
        }),
      ],
    });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
    expect(result.tiers.map((t) => [t.id, t.saleState])).toEqual([
      ['early', 'Ended'],
      ['now', 'OnSale'],
      ['later', 'Scheduled'],
    ]);
  });

  it('summarises sold, capacity and revenue as the sum of the rows', async () => {
    const { prisma } = fakePrisma({
      tiers: [
        tier({ id: 't-ga', sold: 40, capacity: 100 }),
        tier({ id: 't-vip', sold: 5, capacity: 20 }),
      ],
      revenue: [revenue('t-ga', 800), revenue('t-vip', 250)],
    });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);

    expect(result.summary).toEqual({
      sold: 45,
      capacity: 120,
      revenueCents: 105000,
    });
    // The header must equal the rows it sits above.
    expect(result.summary.revenueCents).toBe(
      result.tiers.reduce((n, t) => n + t.revenueCents, 0)
    );
  });

  it('returns an empty view for an event with no tiers', async () => {
    const { prisma } = fakePrisma({ tiers: [] });
    const result = await listTicketTypes(prisma, OWNER, 'e1', {}, NOW);
    expect(result.tiers).toEqual([]);
    expect(result.summary).toEqual({ sold: 0, capacity: 0, revenueCents: 0 });
  });
});
