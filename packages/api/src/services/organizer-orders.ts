/**
 * Screen G — the `/organizer/events/[id]/orders` reads: the orders list and a
 * single order's detail. Pure over an injected `prisma`; authorization is the
 * shared scope seam, and ownership is the event's where clause (an order is only
 * reachable through an event the actor owns).
 *
 * View + breakdown only. The money-moving actions (refund / cancel / comp) and
 * the resend-confirmation write are deferred (see the dashboard UX plan).
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  EventOrderRow,
  OrderDetail,
  OrderLineItem,
  ViewAsInput,
} from '../contracts/organizer';
import { NotFoundError } from './_shared/errors';
import { customerDisplay, toCents } from './_shared/organizerMapping';
import { resolveOrganizerScope } from './organizer-scope';

/** Newest-N cap on the list read. The full set is the CSV export's job. */
export const ORDERS_LIST_LIMIT = 200;

export async function listEventOrders(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  input: ViewAsInput = {}
): Promise<EventOrderRow[]> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );

  // Gate on ownership and read the orders in one round-trip. A non-owned or
  // missing event yields a null gate → NotFound (not a misleading empty list).
  const ownedEvent = { organizerUserId, deletedAt: null };
  const [event, rows] = await Promise.all([
    prisma.events.findFirst({
      where: { id: eventId, ...ownedEvent },
      select: { id: true },
    }),
    prisma.orders.findMany({
      // PENDING is an in-flight/abandoned checkout, not an order to manage —
      // the list is the terminal states (completed, cancelled).
      where: { eventId, event: ownedEvent, status: { not: 'PENDING' } },
      select: {
        id: true,
        name: true,
        email: true,
        total: true,
        status: true,
        createdAt: true,
        _count: { select: { tickets: true } },
      },
      orderBy: { createdAt: { sort: 'desc', nulls: 'last' } },
      take: ORDERS_LIST_LIMIT,
    }),
  ]);

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  return rows.map((order) => ({
    id: order.id,
    customerDisplay: customerDisplay(order),
    amountChargedCents: toCents(order.total),
    ticketCount: order._count.tickets,
    createdAt: order.createdAt?.toISOString() ?? null,
    status: order.status,
  }));
}

export async function getOrderDetail(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  orderId: string,
  input: ViewAsInput = {}
): Promise<OrderDetail> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );

  const order = await prisma.orders.findFirst({
    // Scoped by event ownership AND the eventId in the URL — an order can't be
    // read through a sibling event, even one the actor also owns.
    where: {
      id: orderId,
      eventId,
      event: { organizerUserId, deletedAt: null },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      telephoneNumber: true,
      cardType: true,
      cardLast4: true,
      subtotal: true,
      fees: true,
      total: true,
      subtotalCents: true,
      feesCents: true,
      totalCents: true,
      tickets: {
        select: {
          subtotal: true,
          ticketType: { select: { id: true, name: true, price: true } },
        },
      },
    },
  });

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt?.toISOString() ?? null,
    customer: {
      name: fullName(order),
      email: order.email,
      phone: order.telephoneNumber,
    },
    lineItems: toLineItems(order.tickets),
    // Prefer the reservation-era cents columns; fall back to the legacy floats
    // for orders written before that cutover.
    subtotalCents: order.subtotalCents ?? toCents(order.subtotal),
    feesCents: order.feesCents ?? toCents(order.fees),
    totalCents: order.totalCents ?? toCents(order.total),
    paymentMethod:
      order.cardType && order.cardLast4
        ? `${order.cardType} ····${order.cardLast4}`
        : null,
  };
}

function fullName(order: {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
}): string | null {
  if (order.name?.trim()) return order.name.trim();
  const joined = [order.firstName, order.lastName]
    .filter((part) => part?.trim())
    .join(' ');
  return joined || null;
}

/**
 * Collapse an order's tickets into one line per tier. The line subtotal is the
 * sum of what was actually paid (`Tickets.subtotal`), so the line items
 * reconcile with the order's subtotal — a deleted or repriced tier can't drift
 * them apart. Falls back to the tier's list price for legacy tickets that
 * predate per-ticket subtotals. The unit price is the per-ticket average, which
 * equals the price when a tier's tickets all cost the same (the common case).
 */
function toLineItems(
  tickets: {
    subtotal: number | null;
    ticketType: { id: string; name: string; price: number } | null;
  }[]
): OrderLineItem[] {
  const byTier = new Map<
    string,
    { name: string; quantity: number; subtotalDollars: number }
  >();

  for (const ticket of tickets) {
    const key = ticket.ticketType?.id ?? '__none__';
    const paid = ticket.subtotal ?? ticket.ticketType?.price ?? 0;
    const existing = byTier.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.subtotalDollars += paid;
    } else {
      byTier.set(key, {
        name: ticket.ticketType?.name ?? 'Ticket',
        quantity: 1,
        subtotalDollars: paid,
      });
    }
  }

  return Array.from(byTier.values()).map((tier) => {
    const subtotalCents = toCents(tier.subtotalDollars);
    return {
      name: tier.name,
      quantity: tier.quantity,
      unitPriceCents: Math.round(subtotalCents / tier.quantity),
      subtotalCents,
    };
  });
}
