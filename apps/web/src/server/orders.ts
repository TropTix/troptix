import type { Prisma } from '@troptix/db';
import prisma from '@/server/prisma';

const ORDER_SELECT = {
  id: true,
  status: true,
  type: true,
  createdAt: true,
  total: true,
  totalCents: true,
  subtotal: true,
  subtotalCents: true,
  fees: true,
  feesCents: true,
  cardType: true,
  cardLast4: true,
  event: {
    select: {
      id: true,
      name: true,
      imageUrl: true,
      startsAt: true,
      endsAt: true,
      venue: true,
    },
  },
  _count: { select: { tickets: true } },
} satisfies Prisma.OrdersSelect;

const RECEIPT_TICKET_SELECT = {
  ticketsType: true,
  total: true,
  ticketType: { select: { id: true, name: true } },
} satisfies Prisma.TicketsSelect;

type EnrichedOrder = Prisma.OrdersGetPayload<{ select: typeof ORDER_SELECT }>;
type EnrichedTicket = Prisma.TicketsGetPayload<{
  select: typeof RECEIPT_TICKET_SELECT;
}>;

export async function getOrder(orderId: string): Promise<EnrichedOrder | null> {
  try {
    return await prisma.orders.findUnique({
      where: { id: orderId },
      select: ORDER_SELECT,
    });
  } catch (error) {
    console.error('Failed to fetch order:', error);
    return null;
  }
}

export async function getOrderTickets(
  orderId: string
): Promise<EnrichedTicket[]> {
  return prisma.tickets.findMany({
    where: { orderId },
    select: RECEIPT_TICKET_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

export interface ReceiptLine {
  key: string;
  name: string;
  quantity: number;
  total: number;
}

// Line totals sum the per-ticket Float columns; the order-level *Cents total is
// the authoritative grand total at the call site.
export function aggregateTicketsForReceipt(
  tickets: EnrichedTicket[]
): ReceiptLine[] {
  const byType = new Map<string, ReceiptLine>();

  tickets.forEach((ticket) => {
    const key =
      ticket.ticketsType === 'COMPLEMENTARY'
        ? 'COMPLEMENTARY'
        : (ticket.ticketType?.id ?? 'UNKNOWN');
    const name =
      ticket.ticketsType === 'COMPLEMENTARY'
        ? 'Complementary ticket'
        : (ticket.ticketType?.name ?? 'Standard ticket');

    const total = ticket.total ?? 0;

    const existing = byType.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.total += total;
    } else {
      byType.set(key, { key, name, quantity: 1, total });
    }
  });

  return Array.from(byType.values());
}
