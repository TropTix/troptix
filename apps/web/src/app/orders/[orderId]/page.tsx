import {
  PrismaClient,
  Orders as PrismaOrder,
  Tickets as PrismaTicket,
  Events as PrismaEvent,
  TicketTypes as PrismaTicketType,
  OrderStatus,
} from '@prisma/client';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle,
  Redo,
  CalendarDays,
  MapPin,
  FileText,
  Eye,
  PartyPopper,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import prisma from '@/server/prisma';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

import { getDateFormatter } from '@/lib/dateUtils';
import { getFormattedCurrency } from '@/lib/utils';
import TicketListInteractive from './_components/TicketList';

export interface EnrichedTicket extends PrismaTicket {
  ticketType: PrismaTicketType | null;
}

export interface EnrichedOrder extends PrismaOrder {
  event: PrismaEvent & { imageUrl?: string | null };
  tickets: EnrichedTicket[];
}

async function getOrder(orderId: string): Promise<EnrichedOrder | null> {
  try {
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        event: true,
        tickets: {
          include: { ticketType: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return order as EnrichedOrder;
  } catch (error) {
    console.error('Failed to fetch order:', error);
    return null;
  }
}

export default async function OrderDetailsPage(
  props: {
    params: Promise<{ orderId: string }>;
  }
) {
  const params = await props.params;
  const orderId = params.orderId;
  const order = await getOrder(orderId);
  const now = new Date();
  const isPastEvent = order ? new Date(order.event.endDate) < now : false;

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-4 sm:p-6 bg-slate-50">
        <Alert
          variant="destructive"
          className="max-w-lg text-left w-full sm:w-auto bg-white shadow-lg"
        >
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="font-semibold text-lg">
            Oops! Order Not Found
          </AlertTitle>
          <AlertDescription className="mt-2">
            We couldn&apos;t locate an order with the ID{' '}
            <strong className="font-medium">#{orderId}</strong>. Perhaps
            it&apos;s still making its way through our system, or the ID might
            be a tad off.
            <br />
            <br />
            Double-check your confirmation email, or reach out to our support
            crew if you need a hand!
          </AlertDescription>
        </Alert>
        <Button
          asChild
          className="mt-8 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Link href="/">Back to Homepage</Link>
        </Button>
      </div>
    );
  }

  if (order.status === OrderStatus.PENDING && !isPastEvent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-4 sm:p-6 bg-slate-50">
        <Alert className="max-w-lg text-left bg-blue-50 border-blue-300 text-blue-700 shadow-lg">
          <Redo className="h-5 w-5 text-blue-600 animate-spin" />
          <AlertTitle className="text-blue-800 font-semibold text-lg">
            Hold Tight! Your Order is Processing
          </AlertTitle>
          <AlertDescription className="mt-2 text-blue-700">
            We&apos;re busy preparing your tickets for{' '}
            <strong className="font-medium">{order.event.name}</strong>. Your
            confirmation email is on its way and should land in your inbox
            shortly.
            <br />
            <br />
            The excitement is building!
          </AlertDescription>
        </Alert>
        <Button
          asChild
          className="mt-8 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Link href="/">Explore More Events</Link>
        </Button>
      </div>
    );
  }

  const defaultEventImageUrl = '/placeholder-event.jpg';

  return (
    <div
      className={`min-h-screen ${isPastEvent ? 'bg-slate-100' : 'bg-gradient-to-br from-primary/10 via-background to-background'}`}
    >
      <div className="max-w-5xl mx-auto py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <Card
          className={`mb-10 md:mb-12 shadow-xl overflow-hidden ${isPastEvent ? 'opacity-80' : ''}`}
        >
          <div className="md:flex">
            <div className="md:w-2/5 relative">
              <Image
                src={order.event.imageUrl || defaultEventImageUrl}
                alt={order.event.name || 'Event image'}
                width={400}
                height={400}
                className="w-full h-64 md:h-full object-cover"
                priority
              />
              {isPastEvent && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Badge variant="secondary" className="text-lg px-4 py-2">
                    Event Concluded
                  </Badge>
                </div>
              )}
            </div>
            <div className="md:w-3/5 p-6 sm:p-8 flex flex-col justify-center">
              {isPastEvent ? (
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-700 mb-2">
                  Throwback to: {order.event.name}
                </h1>
              ) : (
                <>
                  <div className="flex items-center text-primary mb-2">
                    <PartyPopper className="h-6 w-6 mr-2" />
                    <span className="text-sm font-semibold uppercase tracking-wider">
                      You&apos;re Going!
                    </span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
                    {order.event.name}
                  </h1>
                </>
              )}
              <div className="flex items-center text-muted-foreground mb-1 text-sm sm:text-base">
                <CalendarDays className="h-4 w-4 mr-2" />
                <span>{getDateFormatter(new Date(order.event.startDate))}</span>
              </div>
              {order.event.venue && (
                <div className="flex items-center text-muted-foreground text-sm sm:text-base mb-4">
                  {' '}
                  {/* Added mb-4 here */}
                  <MapPin className="h-4 w-4 mr-2" />
                  <span>{order.event.venue}</span>
                </div>
              )}
              {/* View Event Details Button */}
              <Button
                asChild
                variant="outline"
                className="w-full sm:w-auto mt-2 mb-4 border-primary/50 hover:border-primary text-primary hover:bg-primary/5 group"
              >
                <Link href={`/events/${order.event.id}`}>
                  {' '}
                  {isPastEvent ? 'View Past Event Details' : 'View Event'}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <p
                className={`text-sm sm:text-base ${isPastEvent ? 'text-slate-600' : 'text-muted-foreground'}`}
              >
                {isPastEvent
                  ? `We hope you had a great time! Here&apos;s a look back at your order details.`
                  : `Get ready for an amazing experience! Your order details are confirmed below.`}
              </p>
            </div>
          </div>
        </Card>

        <div className="grid md:grid-cols-5 gap-6 lg:gap-8">
          <div className="md:col-span-2 space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl flex items-center">
                  <CheckCircle className="h-5 w-5 mr-2 text-green-500" /> Order
                  Confirmed
                </CardTitle>
                <CardDescription>Reference ID: #{order.id}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm sm:text-base">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Placed:</span>
                  <span className="font-medium">
                    {order.createdAt
                      ? getDateFormatter(new Date(order.createdAt))
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold text-md sm:text-lg">
                    {getFormattedCurrency(order.total)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge
                    variant={
                      order.status === OrderStatus.COMPLETED
                        ? 'default'
                        : 'secondary'
                    }
                    className={`${order.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-700 border-green-300' : 'bg-slate-100 text-slate-600'} px-2 py-0.5 text-xs sm:text-sm`}
                  >
                    {order.status.charAt(0).toUpperCase() +
                      order.status.slice(1).toLowerCase()}
                  </Badge>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  asChild
                  className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                  size="sm"
                >
                  <Link href={`/orders/${order.id}/receipt`}>
                    <FileText className="mr-2 h-4 w-4" /> View Full Receipt
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </div>

          <div className="md:col-span-3">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">
                  {isPastEvent
                    ? 'Your Tickets from the Event'
                    : `Your Ticket${order.tickets.length !== 1 ? 's' : ''} (${order.tickets.length})`}
                </CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  {isPastEvent
                    ? 'A reminder of your access.'
                    : 'Access your individual ticket details below.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {order.tickets && order.tickets.length > 0 ? (
                  <TicketListInteractive order={order} />
                ) : (
                  <p className="text-muted-foreground py-4 text-center text-sm sm:text-base">
                    No individual tickets found in this order.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
