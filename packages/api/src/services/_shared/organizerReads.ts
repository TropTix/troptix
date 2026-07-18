/**
 * Row → DTO shapers shared across the organizer reads, so a card or an order
 * looks the same wherever it appears and a fix lands in one place.
 *
 * Each service still owns its own `where` (which events, which orders) — only
 * the *shape* is shared: the select fragment, the mapping, and, for orders, the
 * newest-first-nulls-last ordering that a plain `desc` would get wrong.
 */
import type { Prisma } from '@troptix/db';
import type {
  DashboardRecentOrder,
  OrganizerEventSummary,
  TicketTypeBreakdown,
} from '../../contracts/organizer';
import { getEventStatus } from './eventStatus';
import { customerDisplay, toCents } from './organizerMapping';

const RECENT_ORDERS_LIMIT = 5;

/** The columns an event card needs. Shared so every card is the same shape. */
export const eventCardSelect = {
  id: true,
  name: true,
  imageUrl: true,
  isDraft: true,
  startsAt: true,
  endsAt: true,
  ticketTypes: { select: { capacity: true } },
  _count: {
    select: { tickets: { where: { order: { status: 'COMPLETED' } } } },
  },
} satisfies Prisma.EventsSelect;

type EventCardRow = Prisma.EventsGetPayload<{ select: typeof eventCardSelect }>;

export function toEventSummary(
  event: EventCardRow,
  now: Date
): OrganizerEventSummary {
  return {
    id: event.id,
    name: event.name,
    imageUrl: event.imageUrl ?? null,
    startsAt: event.startsAt.toISOString(),
    sold: event._count.tickets,
    capacity: event.ticketTypes.reduce(
      (total, tier) => total + tier.capacity,
      0
    ),
    status: getEventStatus(event, now),
  };
}

const recentOrderSelect = {
  id: true,
  eventId: true,
  name: true,
  email: true,
  total: true,
  status: true,
  createdAt: true,
} satisfies Prisma.OrdersSelect;

type RecentOrderRow = Prisma.OrdersGetPayload<{
  select: typeof recentOrderSelect;
}>;

/**
 * The findMany args for a recent-orders peek. `createdAt` is still nullable
 * (roadmap 2.9), and Postgres sorts NULLs first under a plain `desc` — so
 * undated orders would lead the list. `nulls: 'last'` keeps them out of the way,
 * in the one place every caller shares.
 */
export function recentOrdersQuery(
  where: Prisma.OrdersWhereInput,
  limit: number = RECENT_ORDERS_LIMIT
) {
  return {
    where,
    select: recentOrderSelect,
    orderBy: { createdAt: { sort: 'desc', nulls: 'last' } },
    take: limit,
  } satisfies Prisma.OrdersFindManyArgs;
}

export function toRecentOrder(order: RecentOrderRow): DashboardRecentOrder {
  return {
    id: order.id,
    eventId: order.eventId,
    customerDisplay: customerDisplay(order),
    amountChargedCents: toCents(order.total),
    createdAt: order.createdAt?.toISOString() ?? null,
    status: order.status,
  };
}

/**
 * One event's completed tickets, grouped by ticket type. The event overview and
 * the ticket-types screen read the same rollup so they can't drift.
 */
export function ticketTypeRollupQuery(eventId: string) {
  return {
    by: ['ticketTypeId'],
    where: { eventId, order: { status: 'COMPLETED' } },
    _count: { _all: true },
    _sum: { subtotal: true },
  } satisfies Prisma.TicketsGroupByArgs;
}

export interface TicketTypeRollupRow {
  ticketTypeId: string | null;
  _count: { _all: number };
  _sum: { subtotal: number | null };
}

/** Ticket type id → its share of Ticket revenue. Deleted types key on null. */
export function revenueCentsByTicketType(rows: TicketTypeRollupRow[]) {
  return new Map(
    rows.map((row) => [row.ticketTypeId, toCents(row._sum.subtotal)])
  );
}

/**
 * Every completed ticket **row**, including any whose ticket type was deleted —
 * "tickets issued", the count you check people in against. Deliberately NOT the
 * sum of the types' `sold` counters, which can't include orphans (CONTEXT.md,
 * "Tickets issued vs sold").
 */
export function ticketsIssued(rows: TicketTypeRollupRow[]): number {
  return rows.reduce((total, row) => total + row._count._all, 0);
}

/**
 * The ticket-type card both screens render. Inventory comes from the type's own
 * counters — the one standard (availability = capacity − reserved − sold).
 */
export function toTicketTypeBreakdown(
  ticketType: { id: string; name: string; capacity: number; sold: number },
  revenueByType: Map<string | null, number>
): TicketTypeBreakdown {
  return {
    id: ticketType.id,
    name: ticketType.name,
    sold: ticketType.sold,
    capacity: ticketType.capacity,
    revenueCents: revenueByType.get(ticketType.id) ?? 0,
  };
}
