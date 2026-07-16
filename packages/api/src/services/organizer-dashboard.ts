/**
 * Screen A — the `/organizer` landing read.
 *
 * Entry-point first: the active events an organizer jumps into, their latest
 * orders, range-scoped stats + sales chart, and the setup state that drives the
 * banner. Pure over an injected `prisma`; authorization is the scope seam
 * (organizer-scope).
 *
 * Every stat is a SQL aggregate — nothing is reduced in JS over a full table.
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  DashboardInput,
  DashboardRange,
  DashboardRecentOrder,
  OrganizerDashboard,
  OrganizerEventSummary,
  SalesPoint,
} from '../contracts/organizer';
import { getEventStatus } from './_shared/eventStatus';
import {
  capacityOf,
  customerDisplay,
  toCents,
} from './_shared/organizerMapping';
import { isProfileComplete } from './_shared/organizerSetup';
import { resolveOrganizerScope } from './organizer-scope';

const ACTIVE_EVENTS_LIMIT = 5;
const RECENT_ORDERS_LIMIT = 5;
const DEFAULT_RANGE: DashboardRange = 'month';

/** Postgres `date_trunc` unit — one bucket per point on the chart. */
type Bucket = 'hour' | 'day';

interface RangeWindow {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
  bucket: Bucket;
  /**
   * How many buckets the chart plots. Explicit rather than derived from
   * `to`, so a `now` landing exactly on a boundary can't drop the current
   * (partial) bucket.
   */
  points: number;
}

/** A bucketed ticket count from the raw sales query. */
interface SalesRow {
  at: Date;
  tickets: bigint;
}

/**
 * A "day" is UTC, everywhere: the window bounds, `date_trunc` in the sales query
 * (the column is `timestamp` and Prisma writes UTC), and the zero-fill. They're
 * joined by bucket-instant, so a server-local boundary would misalign them.
 */
function startOfUtcDay(instant: Date): Date {
  return new Date(
    Date.UTC(
      instant.getUTCFullYear(),
      instant.getUTCMonth(),
      instant.getUTCDate()
    )
  );
}

function addUtcDays(instant: Date, days: number): Date {
  const next = new Date(instant);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Rolling windows, not calendar ones. Short ranges bucket hourly so "today"
 * is a shape rather than a single point.
 */
function rangeWindow(range: DashboardRange, now: Date): RangeWindow {
  const startOfToday = startOfUtcDay(now);

  switch (range) {
    case 'today':
      return {
        from: startOfToday,
        to: now,
        bucket: 'hour',
        // Midnight through the hour in progress.
        points: now.getUTCHours() + 1,
      };
    case 'yesterday':
      return {
        from: addUtcDays(startOfToday, -1),
        to: startOfToday,
        bucket: 'hour',
        points: 24,
      };
    case 'week':
      return {
        from: addUtcDays(startOfToday, -6),
        to: now,
        bucket: 'day',
        points: 7,
      };
    case 'month':
      return {
        from: addUtcDays(startOfToday, -29),
        to: now,
        bucket: 'day',
        points: 30,
      };
  }
}

export async function getDashboard(
  prisma: PrismaClient,
  actor: Actor,
  input: DashboardInput = {},
  now: Date = new Date()
): Promise<OrganizerDashboard> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );

  const range = input.range ?? DEFAULT_RANGE;
  const window = rangeWindow(range, now);
  const startOfToday = startOfUtcDay(now);
  const ownedEvents = { organizerUserId, deletedAt: null };

  const [revenue, salesRows, activeEventRows, recentOrderRows, org] =
    await Promise.all([
      prisma.orders.aggregate({
        _sum: { subtotal: true },
        where: {
          status: 'COMPLETED',
          event: ownedEvents,
          createdAt: { gte: window.from, lt: window.to },
        },
      }),

      // Bucketed in SQL rather than grouping by raw timestamp and folding in JS
      // (which returns ~a row per ticket). Doubles as the tickets-sold total.
      prisma.$queryRaw<SalesRow[]>`
        SELECT date_trunc(${window.bucket}, t."createdAt") AS at,
               count(*)::bigint AS tickets
        FROM "Tickets" t
        JOIN "Orders" o ON o."id" = t."orderId"
        JOIN "Events" e ON e."id" = t."eventId"
        WHERE o."status" = 'COMPLETED'
          AND e."organizerUserId" = ${organizerUserId}
          AND e."deletedAt" IS NULL
          AND t."createdAt" >= ${window.from}
          AND t."createdAt" < ${window.to}
        GROUP BY 1
        ORDER BY 1
      `,

      prisma.events.findMany({
        where: {
          ...ownedEvents,
          isDraft: false,
          endDate: { gte: startOfToday },
        },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          isDraft: true,
          startDate: true,
          endDate: true,
          ticketTypes: { select: { capacity: true, quantity: true } },
          _count: {
            select: { tickets: { where: { order: { status: 'COMPLETED' } } } },
          },
        },
        orderBy: { startDate: 'asc' },
        take: ACTIVE_EVENTS_LIMIT,
      }),

      prisma.orders.findMany({
        where: { status: 'COMPLETED', event: ownedEvents },
        select: {
          id: true,
          name: true,
          email: true,
          total: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_ORDERS_LIMIT,
      }),

      prisma.organization.findFirst({
        where: { ownerUserId: organizerUserId },
        select: { logoUrl: true, bio: true, paidTicketingEnabled: true },
      }),
    ]);

  const activeEvents: OrganizerEventSummary[] = activeEventRows.map(
    (event) => ({
      id: event.id,
      name: event.name,
      imageUrl: event.imageUrl ?? null,
      startsAt: event.startDate.toISOString(),
      sold: event._count.tickets,
      capacity: event.ticketTypes.reduce(
        (total, tier) => total + capacityOf(tier),
        0
      ),
      status: getEventStatus(event, now),
    })
  );

  const recentOrders: DashboardRecentOrder[] = recentOrderRows.map((order) => ({
    id: order.id,
    customerDisplay: customerDisplay(order),
    amountChargedCents: toCents(order.total),
    createdAt: order.createdAt?.toISOString() ?? null,
    status: order.status,
  }));

  return {
    range,
    stats: {
      revenueCents: toCents(revenue._sum.subtotal),
      ticketsSold: salesRows.reduce((sum, row) => sum + Number(row.tickets), 0),
    },
    salesSeries: buildSalesSeries(salesRows, window),
    activeEvents,
    recentOrders,
    setup: {
      profileComplete: isProfileComplete(org),
      paidTicketingEnabled: org?.paidTicketingEnabled ?? false,
    },
  };
}

/** Zero-fills the window so the chart has a point per bucket, not per sale. */
function buildSalesSeries(rows: SalesRow[], window: RangeWindow): SalesPoint[] {
  const counts = new Map(
    rows.map((row) => [row.at.toISOString(), Number(row.tickets)])
  );

  return Array.from({ length: window.points }, (_, offset) => {
    const cursor = new Date(window.from);
    if (window.bucket === 'hour') {
      cursor.setUTCHours(cursor.getUTCHours() + offset);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + offset);
    }

    const at = cursor.toISOString();
    return { at, tickets: counts.get(at) ?? 0 };
  });
}
