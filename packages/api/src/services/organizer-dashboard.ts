/**
 * Screen A — the `/organizer` landing read.
 *
 * Entry-point first: the active events an organizer jumps into, their latest
 * orders, a revenue summary, and the setup state that drives the banner. Pure
 * over an injected `prisma`; authorization is the scope seam (organizer-scope).
 *
 * Every stat is a SQL aggregate — nothing is reduced in JS over a full table.
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  DashboardRecentOrder,
  OrganizerDashboard,
  OrganizerEventSummary,
  ViewAsInput,
} from '../contracts/organizer';
import { getEventStatus } from './_shared/eventStatus';
import {
  capacityOf,
  customerDisplay,
  toCents,
  toDayKey,
} from './_shared/organizerMapping';
import { isProfileComplete } from './_shared/organizerSetup';
import { resolveOrganizerScope } from './organizer-scope';

const ACTIVE_EVENTS_LIMIT = 5;
const RECENT_ORDERS_LIMIT = 5;
const SALES_TREND_DAYS = 30;

/**
 * A "day" is UTC, everywhere: the window bounds here, `date_trunc` in the trend
 * query (the column is `timestamp` and Prisma writes UTC), and `toDayKey`. They
 * are joined by day-string, so a server-local boundary would misalign the
 * buckets off-UTC and silently zero the edge days.
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

/** A day-bucketed ticket count from the raw trend query. */
interface DailySalesRow {
  day: Date;
  tickets: bigint;
}

export async function getDashboard(
  prisma: PrismaClient,
  actor: Actor,
  input: ViewAsInput = {},
  now: Date = new Date()
): Promise<OrganizerDashboard> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );

  const startOfToday = startOfUtcDay(now);
  const trendStart = new Date(startOfToday);
  trendStart.setUTCDate(trendStart.getUTCDate() - (SALES_TREND_DAYS - 1));

  const ownedEvents = { organizerUserId, deletedAt: null };

  const [revenue, dailySalesRows, activeEventRows, recentOrderRows, org] =
    await Promise.all([
      prisma.orders.aggregate({
        _sum: { subtotal: true },
        where: { status: 'COMPLETED', event: ownedEvents },
      }),

      // Day-bucketed in SQL rather than grouping by raw timestamp and folding
      // in JS (which returns ~a row per ticket).
      prisma.$queryRaw<DailySalesRow[]>`
        SELECT date_trunc('day', t."createdAt") AS day, count(*)::bigint AS tickets
        FROM "Tickets" t
        JOIN "Orders" o ON o."id" = t."orderId"
        JOIN "Events" e ON e."id" = t."eventId"
        WHERE o."status" = 'COMPLETED'
          AND e."organizerUserId" = ${organizerUserId}
          AND e."deletedAt" IS NULL
          AND t."createdAt" >= ${trendStart}
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
    activeEvents,
    recentOrders,
    revenue: {
      totalRevenueCents: toCents(revenue._sum.subtotal),
      dailySales: buildSalesTrend(dailySalesRows, trendStart),
    },
    setup: {
      profileComplete: isProfileComplete(org),
      paidTicketingEnabled: org?.paidTicketingEnabled ?? false,
    },
  };
}

/** Zero-fills the window so the chart has a point per day, not just sale days. */
function buildSalesTrend(rows: DailySalesRow[], trendStart: Date) {
  const counts = new Map(
    rows.map((row) => [toDayKey(row.day), Number(row.tickets)])
  );

  return Array.from({ length: SALES_TREND_DAYS }, (_, offset) => {
    const day = new Date(trendStart);
    day.setUTCDate(trendStart.getUTCDate() + offset);
    const date = toDayKey(day);
    return { date, tickets: counts.get(date) ?? 0 };
  });
}
