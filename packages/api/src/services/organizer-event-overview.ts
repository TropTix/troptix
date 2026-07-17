/**
 * Screen C — the `/organizer/events/[id]` overview read.
 *
 * The event's service center: headline vitals, a revenue-over-time chart, the
 * per-tier breakdown, a door check-in summary, and a peek at recent orders.
 * Pure over an injected `prisma`; authorization is the shared scope seam.
 *
 * Ownership is the where clause: the event is fetched scoped to the resolved
 * organizer, so a stranger (or a platform owner without View-as) gets NotFound
 * rather than someone else's event — the old email-bypass (accessControl's
 * getEventWhereClause) is gone (ADR 0018/0019).
 *
 * Two revenue sources, each canonical for its level:
 *   - vitals.revenueCents — Σ Order.subtotal, the same "Ticket revenue" the
 *     dashboard reports.
 *   - tier / series revenue — Σ Tickets.subtotal, so a tier maps to its own
 *     tickets.
 * They track closely (an order's subtotal is the sum of its tickets') but
 * aren't guaranteed cent-equal — different columns, each rounded at its own
 * granularity — so treat the tier column as ≈ the event total, not a checksum.
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  EventOverview,
  EventRevenuePoint,
  EventTierBreakdown,
  ViewAsInput,
} from '../contracts/organizer';
import { NotFoundError } from './_shared/errors';
import { getEventStatus } from './_shared/eventStatus';
import {
  addUtcDays,
  capacityOf,
  startOfUtcDay,
  toCents,
} from './_shared/organizerMapping';
import { recentOrdersQuery, toRecentOrder } from './_shared/organizerReads';
import { resolveOrganizerScope } from './organizer-scope';

/** Chart never shows more than this many days; older events start at day −29. */
const MAX_SERIES_DAYS = 30;

/** Per-tier `_count` + `_sum.subtotal` from the tickets group-by. */
interface TierRollup {
  ticketTypeId: string | null;
  _count: { _all: number };
  _sum: { subtotal: number | null };
}

/** A bucketed day from the revenue-series raw query. */
interface SeriesRow {
  at: Date;
  tickets: bigint;
  revenue: number | null;
}

export async function getEventOverview(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  input: ViewAsInput = {},
  now: Date = new Date()
): Promise<EventOverview> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );

  const event = await prisma.events.findFirst({
    where: { id: eventId, organizerUserId, deletedAt: null },
    select: {
      id: true,
      name: true,
      isDraft: true,
      startsAt: true,
      endsAt: true,
      venue: true,
      createdAt: true,
      ticketTypes: {
        select: { id: true, name: true, capacity: true, quantity: true },
      },
    },
  });

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  // Revenue chart window: event creation through today, capped at 30 days
  // (older events start at day −29 rather than dragging months of zeros).
  const startOfToday = startOfUtcDay(now);
  const earliest = addUtcDays(startOfToday, -(MAX_SERIES_DAYS - 1));
  const created = startOfUtcDay(event.createdAt);
  const seriesFrom = created > earliest ? created : earliest;

  const [revenue, tierRollups, seriesRows, checkedIn, recentOrderRows] =
    await Promise.all([
      prisma.orders.aggregate({
        _sum: { subtotal: true },
        _count: true,
        where: { eventId, status: 'COMPLETED' },
      }),

      // Per-tier sold (count) + revenue (Σ ticket subtotal), completed only.
      prisma.tickets.groupBy({
        by: ['ticketTypeId'],
        where: { eventId, order: { status: 'COMPLETED' } },
        _count: { _all: true },
        _sum: { subtotal: true },
      }),

      // Daily revenue + tickets, bucketed in SQL. Revenue is Σ ticket subtotal
      // so it reconciles with the per-tier breakdown.
      //
      // `AT TIME ZONE 'UTC'` re-tags the truncated naive `timestamp` as a
      // `timestamptz`: without it, node-postgres parses the bucket in the
      // process zone, and on a non-UTC host `row.at.toISOString()` no longer
      // equals the UTC-midnight keys buildRevenueSeries generates — the whole
      // chart would silently zero-fill.
      prisma.$queryRaw<SeriesRow[]>`
        SELECT date_trunc('day', t."createdAt") AT TIME ZONE 'UTC' AS at,
               count(*)::bigint AS tickets,
               sum(t."subtotal") AS revenue
        FROM "Tickets" t
        JOIN "Orders" o ON o."id" = t."orderId"
        WHERE t."eventId" = ${eventId}
          AND o."status" = 'COMPLETED'
          AND t."createdAt" >= ${seriesFrom}
        GROUP BY 1
        ORDER BY 1
      `,

      prisma.tickets.count({
        where: {
          eventId,
          order: { status: 'COMPLETED' },
          checkinTimestamp: { not: null },
        },
      }),

      prisma.orders.findMany(
        recentOrdersQuery({ eventId, status: 'COMPLETED' })
      ),
    ]);

  const tiers = buildTiers(event.ticketTypes, tierRollups);
  const capacity = tiers.reduce((total, tier) => total + tier.capacity, 0);
  // Every completed ticket — including any with a null ticketTypeId, which the
  // per-tier breakdown can't show. So `sold` matches the daily series and the
  // check-in total, even if it exceeds the tiers' visible sum.
  const sold = tierRollups.reduce((total, row) => total + row._count._all, 0);

  return {
    event: {
      id: event.id,
      name: event.name,
      status: getEventStatus(event, now),
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      venue: event.venue ?? null,
    },
    vitals: {
      sold,
      capacity,
      revenueCents: toCents(revenue._sum.subtotal),
      ordersCount: revenue._count,
    },
    revenueSeries: buildRevenueSeries(seriesRows, seriesFrom, startOfToday),
    tiers,
    checkIn: { checkedIn, total: sold },
    recentOrders: recentOrderRows.map(toRecentOrder),
  };
}

function buildTiers(
  ticketTypes: {
    id: string;
    name: string;
    capacity: number | null;
    quantity: number;
  }[],
  rollups: TierRollup[]
): EventTierBreakdown[] {
  const byTier = new Map(
    rollups.map((row) => [
      row.ticketTypeId,
      { sold: row._count._all, revenue: row._sum.subtotal },
    ])
  );

  return ticketTypes.map((tier) => {
    const rollup = byTier.get(tier.id);
    return {
      id: tier.id,
      name: tier.name,
      sold: rollup?.sold ?? 0,
      capacity: capacityOf(tier),
      revenueCents: toCents(rollup?.revenue),
    };
  });
}

/** Zero-fills each day in the window, so the chart has a point per day. */
function buildRevenueSeries(
  rows: SeriesRow[],
  from: Date,
  startOfToday: Date
): EventRevenuePoint[] {
  const byDay = new Map(
    rows.map((row) => [
      row.at.toISOString(),
      { revenueCents: toCents(row.revenue), tickets: Number(row.tickets) },
    ])
  );

  const points: EventRevenuePoint[] = [];
  for (
    let cursor = from;
    cursor <= startOfToday;
    cursor = addUtcDays(cursor, 1)
  ) {
    const at = cursor.toISOString();
    const hit = byDay.get(at);
    points.push({
      at,
      revenueCents: hit?.revenueCents ?? 0,
      tickets: hit?.tickets ?? 0,
    });
  }
  return points;
}
