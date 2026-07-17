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
      where: { eventId, event: ownedEvent },
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

/** Collapse an order's tickets into one line per tier (quantity × unit price). */
function toLineItems(
  tickets: {
    ticketType: { id: string; name: string; price: number } | null;
  }[]
): OrderLineItem[] {
  const byTier = new Map<
    string,
    { name: string; unitPriceCents: number; quantity: number }
  >();

  for (const ticket of tickets) {
    const key = ticket.ticketType?.id ?? '__none__';
    const existing = byTier.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      byTier.set(key, {
        name: ticket.ticketType?.name ?? 'Ticket',
        unitPriceCents: toCents(ticket.ticketType?.price),
        quantity: 1,
      });
    }
  }

  return Array.from(byTier.values()).map((item) => ({
    ...item,
    subtotalCents: item.unitPriceCents * item.quantity,
  }));
}
