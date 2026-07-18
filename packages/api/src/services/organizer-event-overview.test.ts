/**
 * Unit tests for the Screen C event-overview read. Pure over an injected fake
 * `prisma` (ADR 0010). Covers the shared authorization seam (anonymous, scoping,
 * View-as, not-found), the two reconciling revenue sources, the per-tier
 * breakdown with its capacity fallback, `sold` counting null-tier tickets, the
 * check-in summary, and the zero-filled revenue series.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { getEventOverview } from './organizer-event-overview';
import { NotFoundError, UnauthorizedError } from './_shared/errors';

const NOW = new Date('2026-07-15T12:00:00Z');

const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };
const ADMIN: Actor = { kind: 'user', userId: 'admin-1', role: 'PATRON' };

interface FakeOpts {
  email?: string;
  event?: unknown; // undefined → a default event; null → not found
  orderAgg?: { subtotal?: number | null; count?: number };
  tierRollups?: unknown[];
  series?: { at: Date; tickets: bigint; revenue: number | null }[];
  checkedIn?: number;
  orders?: unknown[];
}

const defaultEvent = {
  id: 'e1',
  name: 'Demo Festival',
  isDraft: false,
  startsAt: new Date('2026-07-14T18:00:00Z'),
  endsAt: new Date('2026-07-16T02:00:00Z'),
  venue: 'The Warehouse',
  createdAt: new Date('2026-07-10T00:00:00Z'),
  ticketTypes: [
    { id: 't-ga', name: 'GA', capacity: 100 },
    { id: 't-vip', name: 'VIP', capacity: 20 },
  ],
};

function fakePrisma(opts: FakeOpts = {}) {
  const eventsFindFirst = vi
    .fn()
    .mockResolvedValue(opts.event === undefined ? defaultEvent : opts.event);
  const ordersAggregate = vi.fn().mockResolvedValue({
    _sum: { subtotal: opts.orderAgg?.subtotal ?? 0 },
    _count: opts.orderAgg?.count ?? 0,
  });
  const ticketsGroupBy = vi.fn().mockResolvedValue(opts.tierRollups ?? []);
  const queryRaw = vi.fn().mockResolvedValue(opts.series ?? []);
  const ticketsCount = vi.fn().mockResolvedValue(opts.checkedIn ?? 0);
  const ordersFindMany = vi.fn().mockResolvedValue(opts.orders ?? []);

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
    orders: { aggregate: ordersAggregate, findMany: ordersFindMany },
    tickets: { groupBy: ticketsGroupBy, count: ticketsCount },
    $queryRaw: queryRaw,
  } as unknown as PrismaClient;

  return { prisma, eventsFindFirst };
}

const tier = (id: string, count: number, subtotal: number | null) => ({
  ticketTypeId: id,
  _count: { _all: count },
  _sum: { subtotal },
});

describe('getEventOverview — authorization', () => {
  it('rejects an anonymous actor', async () => {
    const { prisma } = fakePrisma();
    await expect(
      getEventOverview(prisma, { kind: 'anonymous' }, 'e1')
    ).rejects.toThrow(UnauthorizedError);
  });

  it('scopes the event fetch to the acting organizer', async () => {
    const { prisma, eventsFindFirst } = fakePrisma();
    await getEventOverview(prisma, OWNER, 'e1', {}, NOW);
    expect(eventsFindFirst.mock.calls[0][0].where).toMatchObject({
      id: 'e1',
      organizerUserId: 'owner-1',
      deletedAt: null,
    });
  });

  it('throws NotFound when the event is not the organizer’s (no email bypass)', async () => {
    const { prisma } = fakePrisma({ event: null });
    await expect(
      getEventOverview(prisma, OWNER, 'e1', {}, NOW)
    ).rejects.toThrow(NotFoundError);
  });

  it('honors View-as for a platform owner', async () => {
    const { prisma, eventsFindFirst } = fakePrisma({
      email: 'staff@usetroptix.com',
    });
    await getEventOverview(
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

describe('getEventOverview — vitals & tiers', () => {
  it('reports event revenue from Order.subtotal and order count from the aggregate', async () => {
    const { prisma } = fakePrisma({ orderAgg: { subtotal: 1234.5, count: 9 } });
    const result = await getEventOverview(prisma, OWNER, 'e1', {}, NOW);
    expect(result.vitals.revenueCents).toBe(123450);
    expect(result.vitals.ordersCount).toBe(9);
  });

  it('breaks tiers down with subtotal revenue and per-tier capacity', async () => {
    const { prisma } = fakePrisma({
      tierRollups: [tier('t-ga', 40, 400), tier('t-vip', 5, 250)],
    });
    const result = await getEventOverview(prisma, OWNER, 'e1', {}, NOW);
    expect(result.tiers).toEqual([
      { id: 't-ga', name: 'GA', sold: 40, capacity: 100, revenueCents: 40000 },
      { id: 't-vip', name: 'VIP', sold: 5, capacity: 20, revenueCents: 25000 },
    ]);
    expect(result.vitals.capacity).toBe(120);
  });

  it('counts null-tier tickets in sold (and the check-in total) though no tier shows them', async () => {
    const { prisma } = fakePrisma({
      tierRollups: [tier('t-ga', 40, 400), tier(null as never, 3, 30)],
      checkedIn: 10,
    });
    const result = await getEventOverview(prisma, OWNER, 'e1', {}, NOW);
    // 40 mapped + 3 orphaned = 43, even though only GA renders a row.
    expect(result.vitals.sold).toBe(43);
    expect(result.tiers.map((t) => t.id)).toEqual(['t-ga', 't-vip']);
    expect(result.checkIn).toEqual({ checkedIn: 10, total: 43 });
  });
});

describe('getEventOverview — revenue series', () => {
  it('zero-fills daily from event creation through today, in cents', async () => {
    // Event created 2026-07-10; NOW is 2026-07-15 → 6 days (10th..15th).
    const { prisma } = fakePrisma({
      series: [
        { at: new Date('2026-07-12T00:00:00Z'), tickets: 4n, revenue: 80 },
      ],
    });
    const result = await getEventOverview(prisma, OWNER, 'e1', {}, NOW);

    expect(result.revenueSeries).toHaveLength(6);
    expect(result.revenueSeries[0]).toEqual({
      at: '2026-07-10T00:00:00.000Z',
      revenueCents: 0,
      tickets: 0,
    });
    expect(result.revenueSeries[2]).toEqual({
      at: '2026-07-12T00:00:00.000Z',
      revenueCents: 8000,
      tickets: 4,
    });
    expect(result.revenueSeries.at(-1)?.at).toBe('2026-07-15T00:00:00.000Z');
  });

  it('caps the window at 30 days for an event created long ago', async () => {
    const { prisma } = fakePrisma({
      event: { ...defaultEvent, createdAt: new Date('2026-01-01T00:00:00Z') },
    });
    const result = await getEventOverview(prisma, OWNER, 'e1', {}, NOW);
    expect(result.revenueSeries).toHaveLength(30);
    expect(result.revenueSeries[0].at).toBe('2026-06-16T00:00:00.000Z');
  });
});

describe('getEventOverview — recent orders', () => {
  it('shapes the peek as amount charged, newest first', async () => {
    const { prisma } = fakePrisma({
      orders: [
        {
          id: 'o1',
          name: null,
          email: 'buyer@x.com',
          total: 27.5,
          status: 'COMPLETED',
          createdAt: new Date('2026-07-14T10:00:00Z'),
        },
      ],
    });
    const result = await getEventOverview(prisma, OWNER, 'e1', {}, NOW);
    expect(result.recentOrders[0]).toMatchObject({
      id: 'o1',
      customerDisplay: 'buyer@x.com',
      amountChargedCents: 2750,
    });
  });
});
