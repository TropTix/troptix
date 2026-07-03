import {
  Orders as PrismaOrder,
  Tickets as PrismaTicket,
  Events as PrismaEvent,
  TicketTypes as PrismaTicketType,
  OrderStatus,
  OrderType,
} from '@troptix/db';
import Link from 'next/link';
import Image from 'next/image';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import {
  ChevronLeft,
  CalendarDays,
  MapPin,
  Ticket,
  FileText,
  ArrowUpRight,
  Redo,
  AlertTriangle,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import prisma from '@/server/prisma';
import { getDateFormatter } from '@/lib/dateUtils';
import { getFormattedCurrency } from '@/lib/utils';

// Kept for the receipt page, which types its own query against these.
export interface EnrichedTicket extends PrismaTicket {
  ticketType: PrismaTicketType | null;
}
export interface EnrichedOrder extends PrismaOrder {
  event: PrismaEvent & { imageUrl?: string | null };
  tickets: EnrichedTicket[];
}

async function getOrder(orderId: string) {
  try {
    return await prisma.orders.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        createdAt: true,
        total: true,
        totalCents: true,
        type: true,
        cardType: true,
        cardLast4: true,
        status: true,
        event: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            startDate: true,
            endDate: true,
            venue: true,
          },
        },
        _count: { select: { tickets: true } },
      },
    });
  } catch (error) {
    console.error('Failed to fetch order:', error);
    return null;
  }
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      {children}
    </div>
  );
}

export default async function OrderDetailsPage(props: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await props.params;
  const order = await getOrder(orderId);

  if (!order) {
    return (
      <CenteredState>
        <Alert variant="destructive" className="text-left">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="font-semibold">Order not found</AlertTitle>
          <AlertDescription className="mt-1">
            We couldn’t find an order with the ID{' '}
            <span className="font-mono">{orderId}</span>. Double-check the link
            in your confirmation email.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/orders">Back to your tickets</Link>
        </Button>
      </CenteredState>
    );
  }

  const now = new Date();
  const isPastEvent = new Date(order.event.endDate) < now;

  if (order.status === OrderStatus.PENDING && !isPastEvent) {
    return (
      <CenteredState>
        <Redo className="h-6 w-6 animate-spin text-primary" />
        <h1 className="mt-4 text-xl font-extrabold tracking-tight">
          Your order is processing
        </h1>
        <p className="mt-2 text-muted-foreground">
          We’re preparing your tickets for{' '}
          <span className="font-medium text-foreground">
            {order.event.name}
          </span>
          . Your confirmation email is on its way.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Explore more events</Link>
        </Button>
      </CenteredState>
    );
  }

  const isFree =
    order.type === OrderType.FREE || (order.totalCents ?? order.total) === 0;
  const totalDisplay = getFormattedCurrency(
    (order.totalCents ?? Math.round(order.total * 100)) / 100
  );
  const isCompleted = order.status === OrderStatus.COMPLETED;
  const ticketCount = order._count.tickets;
  const poster = eventFlyerUrl(order.event.imageUrl) || DEFAULT_EVENT_IMAGE;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 md:py-14">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/orders"
            aria-label="Back to your tickets"
            className="grid h-9 w-9 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">
            Order details
          </h1>
        </div>

        <div className="space-y-4">
          {/* Event */}
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
            <div className="relative h-[76px] w-[62px] flex-shrink-0 overflow-hidden rounded-xl">
              <Image
                src={poster}
                alt={order.event.name || 'Event'}
                fill
                sizes="62px"
                className={`object-cover ${isPastEvent ? 'opacity-80' : ''}`}
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold leading-tight tracking-tight">
                {order.event.name}
              </h2>
              <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4 text-muted-foreground/70" />
                {getDateFormatter(new Date(order.event.startDate))}
              </div>
              {order.event.venue && (
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-muted-foreground/70" />
                  <span className="truncate">{order.event.venue}</span>
                </div>
              )}
            </div>
          </div>

          {/* Primary action — the tickets are the point */}
          <Button
            asChild
            size="lg"
            className="h-[52px] w-full rounded-2xl text-base font-bold"
          >
            <Link href={`/orders/${order.id}/tickets`}>
              <Ticket className="mr-2 h-5 w-5" />
              View {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'}
            </Link>
          </Button>

          {/* Order summary — receipt-style, machine data in mono */}
          <div>
            <div className="mb-1.5 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Order
            </div>
            <dl className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <dt className="text-sm text-muted-foreground">Order number</dt>
                <dd className="font-mono text-sm font-semibold tracking-wide">
                  {order.id}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <dt className="text-sm text-muted-foreground">Placed</dt>
                <dd className="text-sm font-semibold">
                  {order.createdAt
                    ? getDateFormatter(new Date(order.createdAt))
                    : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <dt className="text-sm text-muted-foreground">Total</dt>
                <dd>
                  {isFree ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      Free
                    </span>
                  ) : (
                    <span className="font-mono text-sm font-semibold">
                      {totalDisplay}
                    </span>
                  )}
                </dd>
              </div>
              {!isFree && order.cardLast4 && (
                <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Paid with</dt>
                  <dd className="text-sm font-semibold">
                    {order.cardType ? `${order.cardType} ` : ''}····{' '}
                    {order.cardLast4}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-3">
                <dt className="text-sm text-muted-foreground">Status</dt>
                <dd>
                  {isCompleted ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Completed
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold capitalize text-muted-foreground">
                      {order.status.toLowerCase()}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Secondary actions */}
          {!isFree && (
            <Button
              asChild
              variant="outline"
              className="h-12 w-full rounded-2xl font-semibold"
            >
              <Link href={`/orders/${order.id}/receipt`}>
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                View full receipt
              </Link>
            </Button>
          )}

          <Link
            href={`/e/${order.event.id}`}
            className="flex items-center justify-center gap-1 py-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
          >
            View event page
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
