// app/orders/[orderId]/tickets/page.tsx
import prisma from '@/server/prisma';
import TicketDisplayManager from './_components/TicketDisplay';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

async function getOrderWithTicketsData(orderId: string) {
  const orderData = await prisma.orders.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      eventId: true,
      tickets: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          firstName: true,
          lastName: true,
          email: true,
          event: {
            select: {
              name: true,
              startDate: true,
              endDate: true,
              venue: true,
              address: true,
              imageUrl: true,
              organizer: true,
            },
          },
          ticketType: {
            select: {
              name: true,
              description: true,
            },
          },
        },
      },
    },
  });

  if (!orderData) {
    return { order: null, tickets: [] };
  }

  return {
    order: { id: orderData.id, eventId: orderData.eventId },
    tickets: orderData.tickets,
  };
}

interface OrderTicketsPageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ ticketId?: string }>;
}

export default async function OrderTicketsPage(props: OrderTicketsPageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { orderId } = params;
  const { ticketId } = searchParams;

  if (!orderId) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-destructive">Order ID is missing.</p>
      </div>
    );
  }

  const { tickets } = await getOrderWithTicketsData(orderId);

  const ticketsWithInfo = tickets.map((ticket) => ({
    id: ticket.id,
    status: ticket.status,
    firstName: ticket.firstName || '',
    lastName: ticket.lastName || '',
    email: ticket.email || '',
    ticketType: { name: ticket.ticketType?.name ?? 'General Admission' },
    event: {
      name: ticket.event.name,
      imageUrl: ticket.event.imageUrl ?? '',
      startDate: ticket.event.startDate,
      venue: ticket.event.venue ?? '',
      address: ticket.event.address ?? '',
    },
  }));

  if (ticketsWithInfo.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">No tickets in this order</h1>
        <Button asChild variant="outline" className="mt-6">
          <Link href={`/orders/${orderId}`}>Back to order</Link>
        </Button>
      </div>
    );
  }

  return (
    <TicketDisplayManager
      tickets={ticketsWithInfo}
      ticketId={ticketId}
      orderId={orderId}
    />
  );
}
