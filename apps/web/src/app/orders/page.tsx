import prisma from '@/server/prisma';
import { getDateFormatter, formatTime } from '@/lib/dateUtils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { ListOrdered, ExternalLink } from 'lucide-react';
import { formatOrderNumber, getFormattedCurrency } from '@/lib/utils';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { OrderCard } from './_components/OrderCard';
type UserOrder = {
  id: string;
  createdAt: Date;
  total: number;
  totalCents: number | null;
  event: {
    id: string;
    name: string | null;
    venue: string | null;
    address: string | null;
    imageUrl: string | null;
    startsAt: Date;
  } | null;
  _count: {
    tickets: number;
  };
};

async function fetchUserOrders(): Promise<UserOrder[]> {
  const user = await getUserFromIdTokenCookie();
  if (!user?.email) {
    return [];
  }

  try {
    const userOrders = await prisma.orders.findMany({
      where: {
        email: user.email.toLowerCase(),
        status: 'COMPLETED',
      },
      select: {
        id: true,
        createdAt: true,
        total: true,
        totalCents: true,
        event: {
          select: {
            id: true,
            name: true,
            venue: true,
            address: true,
            imageUrl: true,
            startsAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            tickets: true,
          },
        },
      },
      orderBy: {
        event: {
          startsAt: 'desc',
        },
      },
    });
    return userOrders as UserOrder[];
  } catch (error) {
    console.error('Failed to fetch user orders:', error);
    return [];
  }
}

function toCardProps(order: UserOrder) {
  const eventDate = order.event?.startsAt
    ? new Date(order.event.startsAt)
    : null;
  const now = new Date();
  const isPastEvent = eventDate ? eventDate < now : false;
  const isToday = eventDate
    ? eventDate.toDateString() === now.toDateString()
    : false;
  const totalCents = order.totalCents ?? Math.round(order.total * 100);

  return {
    id: order.id,
    orderNumber: formatOrderNumber(order.id),
    totalLabel:
      totalCents === 0 ? 'Free' : getFormattedCurrency(totalCents / 100),
    name: order.event?.name || 'Event Name N/A',
    date: eventDate ? getDateFormatter(eventDate, 'MMM dd, yyyy') : 'Date N/A',
    time: eventDate ? formatTime(eventDate) : 'Time N/A',
    venue: order.event?.venue || 'Venue N/A',
    imageUrl: eventFlyerUrl(order.event?.imageUrl) || DEFAULT_EVENT_IMAGE,
    ticketCount: order._count.tickets,
    createdAt: order.createdAt,
    eventDate,
    isPastEvent,
    isToday,
  };
}

export default async function OrdersPage() {
  const orders = await fetchUserOrders();
  const now = new Date().getTime();
  const startMs = (o: UserOrder) =>
    o.event?.startsAt ? new Date(o.event.startsAt).getTime() : 0;

  const upcoming = orders
    .filter((o) => startMs(o) >= now)
    .sort((a, b) => startMs(a) - startMs(b));
  const past = orders
    .filter((o) => startMs(o) < now)
    .sort((a, b) => startMs(b) - startMs(a));

  return (
    <div className="container mt-16 w-full md:mt-20 min-h-screen px-4 py-8">
      <div className="mb-12 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
          My Orders
        </h1>
      </div>

      {orders.length > 0 ? (
        <div className="max-w-7xl mx-auto space-y-12">
          {upcoming.length > 0 && (
            <section>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {upcoming.map((order) => (
                  <OrderCard key={order.id} order={toCardProps(order)} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Past
              </h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {past.map((order) => (
                  <OrderCard key={order.id} order={toCardProps(order)} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <Card className="max-w-md mx-auto text-center">
          <CardContent className="pt-8 pb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <ListOrdered className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No tickets yet</h3>
            <p className="text-muted-foreground mb-6">
              When you purchase tickets, they&apos;ll appear here for easy
              access.
            </p>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/discover">
                Discover Events
                <ExternalLink className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
