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
import { addUtcDays, startOfUtcDay, toCents } from './_shared/organizerMapping';
import {
  eventCardSelect,
  recentOrdersQuery,
  toEventSummary,
  toRecentOrder,
} from './_shared/organizerReads';
import { isProfileComplete } from './_shared/organizerSetup';
import { resolveOrganizerScope } from './organizer-scope';

const ACTIVE_EVENTS_LIMIT = 5;
const DEFAULT_RANGE: DashboardRange = 'month';

type Bucket = 'hour' | 'day';

interface RangeWindow {
  from: Date;
  to: Date;
  bucket: Bucket;
  /**
   * Explicit rather than derived from `to`, so a `now` exactly on a boundary
   * can't drop the current (partial) bucket.
   */
  points: number;
}

interface SalesRow {
  at: Date;
  tickets: bigint;
}

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

      // `AT TIME ZONE 'UTC'` re-tags the naive truncated bucket as UTC; a
      // non-UTC host would otherwise parse it in the process zone and the
      // UTC-keyed zero-fill in buildSalesSeries would miss every bucket.
      prisma.$queryRaw<SalesRow[]>`
        SELECT date_trunc(${window.bucket}, t."createdAt") AT TIME ZONE 'UTC' AS at,
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
          endsAt: { gte: startOfToday },
        },
        select: eventCardSelect,
        orderBy: { startsAt: 'asc' },
        take: ACTIVE_EVENTS_LIMIT,
      }),

      prisma.orders.findMany(
        recentOrdersQuery({ status: 'COMPLETED', event: ownedEvents })
      ),

      prisma.organization.findFirst({
        where: { ownerUserId: organizerUserId },
        select: { logoUrl: true, bio: true, paidTicketingEnabled: true },
      }),
    ]);

  const activeEvents: OrganizerEventSummary[] = activeEventRows.map((event) =>
    toEventSummary(event, now)
  );

  const recentOrders: DashboardRecentOrder[] =
    recentOrderRows.map(toRecentOrder);

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
