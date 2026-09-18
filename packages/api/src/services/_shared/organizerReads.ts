import type { Prisma } from '@troptix/db';
import type {
  DashboardRecentOrder,
  OrganizerEventSummary,
  TicketTypeBreakdown,
} from '../../contracts/organizer';
import { getEventStatus } from './eventStatus';
import { customerDisplay, toCents } from './organizerMapping';

const RECENT_ORDERS_LIMIT = 5;

export const eventCardSelect = {
  id: true,
  name: true,
  imageUrl: true,
  isDraft: true,
  isPrivate: true,
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
    isPrivate: event.isPrivate,
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
 * `createdAt` is still nullable, and Postgres sorts NULLs first under a plain
 * `desc` — undated orders would lead the list without `nulls: 'last'`.
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

export function revenueCentsByTicketType(rows: TicketTypeRollupRow[]) {
  return new Map(
    rows.map((row) => [row.ticketTypeId, toCents(row._sum.subtotal)])
  );
}

/**
 * Deliberately NOT Σ the types' `sold` counters — those can't include tickets
 * whose type was deleted (CONTEXT.md, "Tickets issued vs sold").
 */
export function ticketsIssued(rows: TicketTypeRollupRow[]): number {
  return rows.reduce((total, row) => total + row._count._all, 0);
}

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
