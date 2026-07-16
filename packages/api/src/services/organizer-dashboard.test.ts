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
  dailySales?: { day: Date; tickets: bigint }[];
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
  const queryRaw = vi.fn().mockResolvedValue(opts.dailySales ?? []);

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

  return { prisma, eventsFindMany, ordersFindMany, orgFindFirst };
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    name: 'Demo Festival',
    imageUrl: 'flyer.jpg',
    isDraft: false,
    startsAt: new Date('2026-07-14T18:00:00Z'),
    startDate: new Date('2026-07-14T18:00:00Z'),
    endsAt: new Date('2026-07-16T02:00:00Z'),
    endDate: new Date('2026-07-16T02:00:00Z'),
    ticketTypes: [
      { capacity: 100, quantity: 100 },
      { capacity: null, quantity: 50 },
    ],
    _count: { tickets: 42 },
    ...overrides,
  };
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
    expect(result.revenue.totalRevenueCents).toBe(5997);
  });

  it('reports zero revenue when there are no completed orders', async () => {
    const { prisma } = fakePrisma({ subtotalSum: null });
    const result = await getDashboard(prisma, OWNER, {}, NOW);
    expect(result.revenue.totalRevenueCents).toBe(0);
  });

  it('sums capacity across tiers with the legacy quantity fallback', async () => {
    const { prisma } = fakePrisma({ events: [eventRow()] });
    const result = await getDashboard(prisma, OWNER, {}, NOW);
    // capacity 100 + (null → quantity 50)
    expect(result.activeEvents[0]).toMatchObject({
      sold: 42,
      capacity: 150,
      status: 'Active',
      thumbnailUrl: 'flyer.jpg',
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
      dailySales: [{ day: new Date('2026-07-15T00:00:00Z'), tickets: 7n }],
    });

    const result = await getDashboard(prisma, OWNER, {}, NOW);

    expect(result.revenue.dailySales).toHaveLength(30);
    expect(result.revenue.dailySales.at(-1)).toEqual({
      date: '2026-07-15',
      tickets: 7,
    });
    expect(result.revenue.dailySales[0]).toEqual({
      date: '2026-06-16',
      tickets: 0,
    });
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
