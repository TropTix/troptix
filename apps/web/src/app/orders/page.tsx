// app/orders/page.tsx
import prisma from '@/server/prisma';
import { getDateFormatter, formatTime } from '@/lib/dateUtils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import {
  ListOrdered,
  Ticket,
  Calendar,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { getUserFromIdTokenCookie } from '@/server/authUser';
type UserOrder = {
  id: string;
  createdAt: Date;
  event: {
    id: string;
    name: string | null;
    venue: string | null;
    address: string | null;
    imageUrl: string | null;
    startDate: Date;
  } | null;
  _count: {
    tickets: number;
  };
};

async function fetchUserOrders(): Promise<UserOrder[]> {
  const user = await getUserFromIdTokenCookie();
  if (!user?.email) {
    console.log('User not found or user ID missing for fetching orders.');
    return [];
  }

  // Opportunistic claim: stamp this user onto any orders they bought as a guest
  // (matched by email, userId still null). Durable link beyond the email string.
  try {
    await prisma.orders.updateMany({
      where: { email: user.email, userId: null },
      data: { userId: user.uid },
    });
  } catch (error) {
    console.error('Failed to backfill order ownership:', error);
  }

  try {
    const userOrders = await prisma.orders.findMany({
      where: {
        email: user.email,
        status: 'COMPLETED',
      },
      select: {
        id: true,
        createdAt: true,
        event: {
          select: {
            id: true,
            name: true,
            venue: true,
            address: true,
            imageUrl: true,
            startDate: true,
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
          startDate: 'desc',
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
  const eventDate = order.event?.startDate
    ? new Date(order.event.startDate)
    : null;
  const now = new Date();
  const isPastEvent = eventDate ? eventDate < now : false;
  const isToday = eventDate
    ? eventDate.toDateString() === now.toDateString()
    : false;

  return {
    id: order.id,
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
    o.event?.startDate ? new Date(o.event.startDate).getTime() : 0;

  // Upcoming leads (soonest first — the ticket you're about to use); past trails.
  const upcoming = orders
    .filter((o) => startMs(o) >= now)
    .sort((a, b) => startMs(a) - startMs(b));
  const past = orders
    .filter((o) => startMs(o) < now)
    .sort((a, b) => startMs(b) - startMs(a));

  return (
    <div className="container mt-16 w-full md:mt-20 min-h-screen px-4 py-8">
      <div className="mb-12 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
          Your Tickets
        </h1>
        <p className="text-muted-foreground text-lg">
          Manage and view all your event tickets in one place
        </p>
      </div>

      {orders.length > 0 ? (
        <div className="max-w-7xl mx-auto space-y-12">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Upcoming
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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

type OrderCardProps = {
  order: {
    id: string;
    name: string;
    date: string;
    time: string;
    venue: string;
    imageUrl: string;
    ticketCount: number;
    createdAt: Date;
    eventDate: Date | null;
    isPastEvent: boolean;
    isToday: boolean;
  };
};

const OrderCard = ({ order }: OrderCardProps) => {
  if (!order) {
    return null;
  }

  const {
    id,
    name,
    date,
    time,
    venue,
    imageUrl,
    ticketCount,
    createdAt,
    isPastEvent,
    isToday,
    eventDate,
  } = order;

  const getEventStatus = () => {
    if (isPastEvent)
      return { label: 'Past Event', variant: 'secondary' as const };
    if (isToday) return { label: 'Today', variant: 'destructive' as const };

    if (eventDate) {
      const daysUntil = Math.ceil(
        (eventDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntil <= 7)
        return { label: 'This Week', variant: 'default' as const };
    }

    return { label: 'Upcoming', variant: 'outline' as const };
  };

  const status = getEventStatus();

  const getRelativeDate = () => {
    if (!eventDate) return date;

    const now = new Date();
    const diffTime = eventDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (isPastEvent) return date;
    if (isToday) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `In ${diffDays} days`;

    return date;
  };

  return (
    <Card
      className={`group hover:shadow-lg transition-all duration-300 cursor-pointer ${isPastEvent ? 'opacity-75' : 'hover:scale-[1.02]'}`}
    >
      <Link href={`/orders/${id}`} className="block">
        <div className="relative">
          <div className="aspect-video relative overflow-hidden rounded-t-lg">
            <Image
              src={imageUrl}
              alt={`${name} event image`}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <div className="absolute top-3 right-3">
              <Badge variant={status.variant} className="shadow-sm">
                {status.label}
              </Badge>
            </div>
          </div>

          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {name}
              </h3>
            </div>
          </CardHeader>

          <CardContent className="pt-0 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="font-medium">{getRelativeDate()}</span>
                {!isPastEvent && !isToday && (
                  <span className="ml-2 text-xs">at {time}</span>
                )}
              </div>

              {venue && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span className="truncate">{venue}</span>
                </div>
              )}

              <div className="flex items-center text-sm text-muted-foreground">
                <Ticket className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>
                  {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'}
                </span>
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-0 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Ordered {createdAt.toLocaleDateString()}
            </div>
            <div className="flex items-center text-sm text-primary font-medium group-hover:text-primary/80">
              View Tickets
              <ExternalLink className="w-3 h-3 ml-1" />
            </div>
          </CardFooter>
        </div>
      </Link>
    </Card>
  );
};
