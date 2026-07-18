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
    customerDisplay: customerDisplay(order),
    amountChargedCents: toCents(order.total),
    createdAt: order.createdAt?.toISOString() ?? null,
    status: order.status,
  };
}
