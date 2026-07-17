/**
 * Unit tests for the dashboard read. Pure over an injected fake `prisma`
 * (ADR 0010) — no Postgres. Covers the authorization seam (anonymous, scoping,
 * View-as), the cents boundary, capacity/status shaping, and the zero-filled
 * sales trend.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { getDashboard } from './organizer-dashboard';
import { UnauthorizedError } from './_shared/errors';

const NOW = new Date('2026-07-15T12:00:00Z');

const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };
const ADMIN: Actor = { kind: 'user', userId: 'admin-1', role: 'PATRON' };

interface FakeOpts {
  email?: string;
  subtotalSum?: number | null;
  sales?: { at: Date; tickets: bigint }[];
  events?: unknown[];
  orders?: unknown[];
  org?: unknown;
}

function fakePrisma(opts: FakeOpts = {}) {
  const eventsFindMany = vi.fn().mockResolvedValue(opts.events ?? []);
  const ordersFindMany = vi.fn().mockResolvedValue(opts.orders ?? []);
  const ordersAggregate = vi
    .fn()
    .mockResolvedValue({ _sum: { subtotal: opts.subtotalSum ?? 0 } });
  const orgFindFirst = vi.fn().mockResolvedValue(opts.org ?? null);
  const queryRaw = vi.fn().mockResolvedValue(opts.sales ?? []);

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
    orders: { aggregate: ordersAggregate, findMany: ordersFindMany },
    events: { findMany: eventsFindMany },
    organization: { findFirst: orgFindFirst },
    $queryRaw: queryRaw,
  } as unknown as PrismaClient;

  return { prisma, eventsFindMany, ordersFindMany };
}

describe('getDashboard — authorization', () => {
  it('rejects an anonymous actor', async () => {
    const { prisma } = fakePrisma();
    await expect(getDashboard(prisma, { kind: 'anonymous' })).rejects.toThrow(
      UnauthorizedError
    );
  });

  it('scopes every read to the acting organizer', async () => {
    const { prisma, eventsFindMany } = fakePrisma();
    await getDashboard(prisma, OWNER, {}, NOW);

    const where = eventsFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizerUserId: 'owner-1',
      deletedAt: null,
    });
  });

  it('ignores View-as for a non-platform-owner (pins them to themselves)', async () => {
    const { prisma, eventsFindMany } = fakePrisma({
      email: 'someone@gmail.com',
    });

    await getDashboard(
      prisma,
      OWNER,
      { viewAsOrganizerUserId: 'someone-else' },
      NOW
    );

    expect(eventsFindMany.mock.calls[0][0].where.organizerUserId).toBe(
      'owner-1'
    );
  });

  it('honors View-as for a platform owner', async () => {
    const { prisma, eventsFindMany } = fakePrisma({
      email: 'staff@usetroptix.com',
    });

    await getDashboard(
      prisma,
      ADMIN,
      { viewAsOrganizerUserId: 'target-organizer' },
      NOW
    );

    expect(eventsFindMany.mock.calls[0][0].where.organizerUserId).toBe(
      'target-organizer'
    );
  });

  it('excludes soft-deleted events', async () => {
    const { prisma, eventsFindMany, ordersFindMany } = fakePrisma();
    await getDashboard(prisma, OWNER, {}, NOW);

    expect(eventsFindMany.mock.calls[0][0].where.deletedAt).toBeNull();
    expect(ordersFindMany.mock.calls[0][0].where.event.deletedAt).toBeNull();
  });
});

describe('getDashboard — shaping', () => {
  it('converts revenue to integer cents, rounding the summed total once', async () => {
    // A float sum that would drift if rounded per row.
    const { prisma } = fakePrisma({ subtotalSum: 59.969999999999999 });
    const result = await getDashboard(prisma, OWNER, {}, NOW);
    expect(result.stats.revenueCents).toBe(5997);
  });

  it('reports zero revenue when there are no completed orders', async () => {
    const { prisma } = fakePrisma({ subtotalSum: null });
    const result = await getDashboard(prisma, OWNER, {}, NOW);
    expect(result.stats.revenueCents).toBe(0);
  });

  it('sums capacity across tiers', async () => {
    const { prisma } = fakePrisma({
      events: [
        {
          id: 'e1',
          name: 'Demo Festival',
          imageUrl: 'flyer.jpg',
          isDraft: false,
          startsAt: new Date('2026-07-14T18:00:00Z'),
          endsAt: new Date('2026-07-16T02:00:00Z'),
          ticketTypes: [{ capacity: 100 }, { capacity: 50 }],
          _count: { tickets: 42 },
        },
      ],
    });

    const result = await getDashboard(prisma, OWNER, {}, NOW);

    expect(result.activeEvents[0]).toMatchObject({
      sold: 42,
      capacity: 150,
      status: 'Active',
      // The stored path, unresolved — the web layer turns it into a URL.
      imageUrl: 'flyer.jpg',
    });
  });

  it('shapes recent orders as amount charged (Order.total), not revenue', async () => {
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

    const result = await getDashboard(prisma, OWNER, {}, NOW);
    expect(result.recentOrders[0]).toMatchObject({
      id: 'o1',
      customerDisplay: 'buyer@x.com', // falls back to email
      amountChargedCents: 2750,
      status: 'COMPLETED',
    });
  });

  it('surfaces a null order date rather than inventing one (Orders.createdAt is still nullable — roadmap 2.9)', async () => {
    const { prisma } = fakePrisma({
      orders: [
        {
          id: 'o1',
          name: 'Ada',
          email: 'ada@x.com',
          total: 10,
          status: 'COMPLETED',
          createdAt: null,
        },
      ],
    });

    const result = await getDashboard(prisma, OWNER, {}, NOW);
    expect(result.recentOrders[0].createdAt).toBeNull();
    expect(result.recentOrders[0].customerDisplay).toBe('Ada');
  });

  it('zero-fills the 30-day sales trend around days that had sales', async () => {
    const { prisma } = fakePrisma({
      sales: [{ at: new Date('2026-07-15T00:00:00Z'), tickets: 7n }],
    });

    const result = await getDashboard(prisma, OWNER, {}, NOW);

    expect(result.salesSeries).toHaveLength(30);
    expect(result.salesSeries.at(-1)).toEqual({
      at: '2026-07-15T00:00:00.000Z',
      tickets: 7,
    });
    expect(result.salesSeries[0]).toEqual({
      at: '2026-06-16T00:00:00.000Z',
      tickets: 0,
    });
  });
});

describe('getDashboard — range', () => {
  const bucketOf = (prismaMock: { $queryRaw: unknown }) =>
    // The tagged-template call passes the bound values after the strings array.
    (prismaMock.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][1];

  it('defaults to the past month, bucketed daily', async () => {
    const { prisma } = fakePrisma();
    const result = await getDashboard(prisma, OWNER, {}, NOW);

    expect(result.range).toBe('month');
    expect(result.salesSeries).toHaveLength(30);
    expect(bucketOf(prisma as never)).toBe('day');
  });

  it('buckets today hourly, from midnight through the current hour', async () => {
    const { prisma } = fakePrisma();
    const result = await getDashboard(prisma, OWNER, { range: 'today' }, NOW);

    expect(result.range).toBe('today');
    expect(bucketOf(prisma as never)).toBe('hour');
    // NOW is 12:00Z → hours 00:00..12:00 inclusive.
    expect(result.salesSeries).toHaveLength(13);
    expect(result.salesSeries[0].at).toBe('2026-07-15T00:00:00.000Z');
    expect(result.salesSeries.at(-1)?.at).toBe('2026-07-15T12:00:00.000Z');
  });

  it('covers yesterday as a full 24 hours, ending at midnight', async () => {
    const { prisma } = fakePrisma();
    const result = await getDashboard(
      prisma,
      OWNER,
      { range: 'yesterday' },
      NOW
    );

    expect(result.salesSeries).toHaveLength(24);
    expect(result.salesSeries[0].at).toBe('2026-07-14T00:00:00.000Z');
    expect(result.salesSeries.at(-1)?.at).toBe('2026-07-14T23:00:00.000Z');
  });

  it('keeps the in-progress bucket when now lands exactly on a boundary', async () => {
    const { prisma } = fakePrisma();
    const midnight = new Date('2026-07-15T00:00:00.000Z');

    // Today at exactly 00:00 is still one (empty) hour of data, and the month
    // still ends on today — an off-by-one here silently drops the newest bucket.
    const today = await getDashboard(
      prisma,
      OWNER,
      { range: 'today' },
      midnight
    );
    expect(today.salesSeries).toHaveLength(1);
    expect(today.salesSeries[0].at).toBe('2026-07-15T00:00:00.000Z');

    const month = await getDashboard(
      prisma,
      OWNER,
      { range: 'month' },
      midnight
    );
    expect(month.salesSeries).toHaveLength(30);
    expect(month.salesSeries.at(-1)?.at).toBe('2026-07-15T00:00:00.000Z');
  });

  it('covers the past week as 7 days', async () => {
    const { prisma } = fakePrisma();
    const result = await getDashboard(prisma, OWNER, { range: 'week' }, NOW);

    expect(result.salesSeries).toHaveLength(7);
    expect(result.salesSeries[0].at).toBe('2026-07-09T00:00:00.000Z');
  });

  it('scopes the revenue aggregate to the range window', async () => {
    const { prisma } = fakePrisma();
    await getDashboard(prisma, OWNER, { range: 'today' }, NOW);

    const where = (prisma.orders.aggregate as ReturnType<typeof vi.fn>).mock
      .calls[0][0].where;
    expect(where.createdAt.gte).toEqual(new Date('2026-07-15T00:00:00.000Z'));
    expect(where.createdAt.lt).toEqual(NOW);
  });

  it('derives tickets sold from the same buckets the chart uses', async () => {
    const { prisma } = fakePrisma({
      sales: [
        { at: new Date('2026-07-15T09:00:00Z'), tickets: 4n },
        { at: new Date('2026-07-15T11:00:00Z'), tickets: 3n },
      ],
    });

    const result = await getDashboard(prisma, OWNER, { range: 'today' }, NOW);

    expect(result.stats.ticketsSold).toBe(7);
    expect(
      result.salesSeries.reduce((sum, point) => sum + point.tickets, 0)
    ).toBe(7);
  });
});

describe('getDashboard — setup state', () => {
  it('is incomplete with no organization at all', async () => {
    const { prisma } = fakePrisma({ org: null });
    const result = await getDashboard(prisma, OWNER, {}, NOW);
    expect(result.setup).toEqual({
      profileComplete: false,
      paidTicketingEnabled: false,
    });
  });

  it('needs both a logo and a bio to count as complete', async () => {
    const { prisma } = fakePrisma({
      org: { logoUrl: 'logo.png', bio: null, paidTicketingEnabled: true },
    });
    const result = await getDashboard(prisma, OWNER, {}, NOW);
    expect(result.setup).toEqual({
      profileComplete: false,
      paidTicketingEnabled: true,
    });
  });

  it('is complete with a logo and a bio', async () => {
    const { prisma } = fakePrisma({
      org: {
        logoUrl: 'logo.png',
        bio: 'We throw parties',
        paidTicketingEnabled: false,
      },
    });
    const result = await getDashboard(prisma, OWNER, {}, NOW);
    expect(result.setup.profileComplete).toBe(true);
  });
});
