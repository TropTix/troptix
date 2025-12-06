// app/order/[orderId]/tickets/page.tsx
import prisma from '@/server/prisma'; // Adjust to your Prisma client path
import TicketDisplayManager, { TicketInfo } from './_components/TicketDisplay'; // We'll create this client component
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';

async function getOrderWithTicketsData(orderId: string) {
  const orderData = await prisma.orders.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      eventId: true,
      tickets: {
        orderBy: { createdAt: 'asc' },
        include: {
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
  searchParams: Promise<{ ticketId: string | undefined }>;
}

export default async function OrderTicketsPage(props: OrderTicketsPageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { orderId } = params;
  const { ticketId } = searchParams;

  if (!orderId) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-red-500">Order ID is missing.</p>
      </div>
    );
  }

  const { order, tickets } = await getOrderWithTicketsData(orderId);

  const ticketsWithInfo = tickets.map((ticket) => ({
    ...ticket,
    firstName: ticket.firstName || '',
    lastName: ticket.lastName || '',
    email: ticket.email || '',
  }));

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-semibold mb-4">Order Not Found</h1>
        <p className="text-muted-foreground">
          The order with ID <span className="font-mono">{orderId}</span> could
          not be found.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/orders">Back to Orders</Link>{' '}
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center gap-4">
        <BackButton href={`/orders/${orderId}`} />
        <div className="flex flex-col">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            Tickets for Order
          </h1>
          <p className="text-xl text-gray-500 dark:text-gray-400 mt-1">
            Order ID: <span className="font-mono text-lg">{orderId}</span>
          </p>
        </div>
      </div>

      {tickets.length === 0 ? (
        <p className="text-center text-lg text-gray-500 dark:text-gray-400 py-10">
          No tickets found for this order.
        </p>
      ) : (
        <TicketDisplayManager tickets={ticketsWithInfo} ticketId={ticketId} />
      )}
    </div>
  );
}
