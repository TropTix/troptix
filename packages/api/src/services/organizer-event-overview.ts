/**
 * Two revenue sources: vitals is Σ Order.subtotal; per-type / series is
 * Σ Tickets.subtotal. Close but not guaranteed cent-equal — never a checksum.
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  EventOverview,
  EventRevenuePoint,
  TicketTypeBreakdown,
  ViewAsInput,
} from '../contracts/organizer';
import { NotFoundError } from './_shared/errors';
import { getEventStatus } from './_shared/eventStatus';
import { addUtcDays, startOfUtcDay, toCents } from './_shared/organizerMapping';
import {
  recentOrdersQuery,
  revenueCentsByTicketType,
  ticketsIssued,
  ticketTypeRollupQuery,
  toRecentOrder,
  toTicketTypeBreakdown,
} from './_shared/organizerReads';
import { resolveOrganizerScope } from './organizer-scope';

const MAX_SERIES_DAYS = 30;

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
        select: { id: true, name: true, capacity: true, sold: true },
      },
    },
  });

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  const startOfToday = startOfUtcDay(now);
  const earliest = addUtcDays(startOfToday, -(MAX_SERIES_DAYS - 1));
  const created = startOfUtcDay(event.createdAt);
  const seriesFrom = created > earliest ? created : earliest;

  const [revenue, rollups, seriesRows, checkedIn, recentOrderRows] =
    await Promise.all([
      prisma.orders.aggregate({
        _sum: { subtotal: true },
        _count: true,
        where: { eventId, status: 'COMPLETED' },
      }),

      prisma.tickets.groupBy(ticketTypeRollupQuery(eventId)),

      // `AT TIME ZONE 'UTC'` re-tags the naive truncated bucket as UTC; a
      // non-UTC host would otherwise parse it in the process zone and the
      // whole chart would silently zero-fill.
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

  const revenueByType = revenueCentsByTicketType(rollups);
  const ticketTypes = event.ticketTypes.map((ticketType) =>
    toTicketTypeBreakdown(ticketType, revenueByType)
  );
  const capacity = ticketTypes.reduce(
    (total, ticketType) => total + ticketType.capacity,
    0
  );
  // Tickets *issued*, not Σ the types' `sold`: includes deleted-type tickets,
  // matching the series and check-in totals (CONTEXT.md) — can exceed the rows.
  const sold = ticketsIssued(rollups);

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
    ticketTypes,
    checkIn: { checkedIn, total: sold },
    recentOrders: recentOrderRows.map(toRecentOrder),
  };
}

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
