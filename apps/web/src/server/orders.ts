import {
  Orders as PrismaOrder,
  Tickets as PrismaTicket,
  Events as PrismaEvent,
  TicketTypes as PrismaTicketType,
} from '@troptix/db';
import prisma from '@/server/prisma';

export interface EnrichedTicket extends PrismaTicket {
  ticketType: PrismaTicketType | null;
}
export interface EnrichedOrder extends PrismaOrder {
  event: PrismaEvent;
  _count: { tickets: number };
}

// Receipt ticket rows load separately (getOrderTickets) so free orders, which
// show no receipt, don't pay for a ticket fetch they discard.
export async function getOrder(orderId: string): Promise<EnrichedOrder | null> {
  try {
    return await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        event: true,
        _count: { select: { tickets: true } },
      },
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
    include: { ticketType: true },
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
