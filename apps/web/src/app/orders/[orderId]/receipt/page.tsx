import { PrismaClient, OrderStatus } from '@prisma/client';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle,
  TicketIcon as TicketIconLucide,
  CalendarDays,
  MapPin,
  Home,
  Info,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

import { getDateFormatter } from '@/lib/dateUtils'; // Assuming getTimeFormatter
import { getFormattedCurrency } from '@/lib/utils';
import { EnrichedOrder } from '../page';

const prisma = new PrismaClient();

interface AggregatedTicketRow {
  key: string;
  name: string;
  quantity: number;
  pricePerTicket: number;
  subtotal: number;
  fee: number;
  total: number;
}

async function getOrderForReceipt(orderId: string) {
  try {
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        event: true,
        tickets: {
          include: {
            ticketType: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
    return order;
  } catch (error) {
    console.error('Failed to fetch order for receipt:', error);
    return null;
  }
}

function aggregateTicketsForReceipt(
  tickets: EnrichedOrder['tickets']
): AggregatedTicketRow[] {
  const orderMap = new Map<string, AggregatedTicketRow>();

  tickets.forEach((ticket) => {
    // Use ticketType.id for paid tickets, a special string for complementary
    const ticketTypeId =
      ticket.ticketsType === 'COMPLEMENTARY'
        ? 'COMPLEMENTARY_ID'
        : ticket.ticketType?.id || 'UNKNOWN_TICKET_TYPE_ID';
    const ticketName =
      ticket.ticketsType === 'COMPLEMENTARY'
        ? 'Complementary Ticket'
        : ticket.ticketType?.name || 'Standard Ticket';

    // Ensure numeric values, defaulting to 0 if null/undefined
    const ticketSubtotal = ticket.subtotal ?? 0;
    const ticketFees = ticket.fees ?? 0;
    const ticketTotal = ticket.total ?? 0; // This is the total for THIS specific ticket instance

    if (orderMap.has(ticketTypeId)) {
      const existingRow = orderMap.get(ticketTypeId)!;
      existingRow.quantity += 1;
      existingRow.subtotal += ticketSubtotal; // Sum of individual ticket subtotals
      existingRow.fee += ticketFees; // Sum of individual ticket fees
      existingRow.total += ticketTotal; // Sum of individual ticket totals
      // pricePerTicket should ideally be consistent for a given ticketType.
      // If it can vary per ticket instance of the same type, this aggregation might need adjustment.
    } else {
      orderMap.set(ticketTypeId, {
        key: ticketTypeId,
        name: ticketName,
        quantity: 1,
        // For the first ticket of its type, its subtotal is the pricePerTicket (before fees for that one ticket)
        pricePerTicket: ticketSubtotal,
        subtotal: ticketSubtotal,
        fee: ticketFees,
        total: ticketTotal,
      });
    }
  });
  return Array.from(orderMap.values());
}

export default async function OrderReceiptPage(
  props: {
    params: Promise<{ orderId: string }>;
  }
) {
  const params = await props.params;
  const orderId = params.orderId;
  const order = await getOrderForReceipt(orderId);

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center p-6 bg-slate-50 dark:bg-slate-900">
        <Alert
          variant="destructive"
          className="max-w-lg text-left w-full sm:w-auto bg-white dark:bg-slate-800 shadow-lg"
        >
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="font-semibold text-lg">
            Order Not Found
          </AlertTitle>
          <AlertDescription className="mt-2">
            We couldn&apos;t find an order with the ID{' '}
            <strong className="font-medium">#{orderId}</strong>. Please check
            the ID or contact support if you believe this is an error.
          </AlertDescription>
        </Alert>
        <Button asChild className="mt-8">
          <Link href="/">Go to Homepage</Link>
        </Button>
      </div>
    );
  }

  if (order.status === OrderStatus.CANCELLED) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center p-6 bg-slate-50 dark:bg-slate-900">
        <Alert
          variant="default"
          className="max-w-lg text-left w-full sm:w-auto bg-white dark:bg-slate-800 shadow-lg border-yellow-400 dark:border-yellow-600"
        >
          <Info className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
          <AlertTitle className="font-semibold text-lg text-yellow-700 dark:text-yellow-300">
            Order Cancelled
          </AlertTitle>
          <AlertDescription className="mt-2 text-slate-700 dark:text-slate-300">
            This order (<strong className="font-medium">#{orderId}</strong>) has
            been cancelled. If you have any questions, please contact our
            support team.
          </AlertDescription>
        </Alert>
        <Button asChild className="mt-8">
          <Link href="/">Go to Homepage</Link>
        </Button>
      </div>
    );
  }
  if (order.status === OrderStatus.PENDING) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center p-6 bg-slate-50 dark:bg-slate-900">
        <Alert variant="info">
          <AlertTitle>Order Pending</AlertTitle>
          <AlertDescription>
            Your order is pending. Please check back later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const aggregatedTicketData = aggregateTicketsForReceipt(order.tickets);
  const overallSubtotalFromAggregation = aggregatedTicketData.reduce(
    (sum, item) => sum + item.subtotal,
    0
  );
  const overallFeesFromAggregation = aggregatedTicketData.reduce(
    (sum, item) => sum + item.fee,
    0
  );
  // Use the order's master total for the grand total to ensure accuracy, as it's the source of truth.
  const grandTotal = order.total;

  const defaultEventImageUrl = '/placeholder-event.jpg'; // Path to your default event image in /public

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8 md:py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="shadow-xl overflow-hidden border dark:border-slate-700">
          <CardHeader className="bg-slate-100 dark:bg-slate-800 p-6 sm:p-8 border-b dark:border-slate-700">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
                  Order Receipt
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Order ID:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    #{order.id.toUpperCase()}
                  </span>
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Date Placed:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {getDateFormatter(new Date(order.createdAt || Date.now()))}
                  </span>
                </p>
              </div>
              <div className="text-left sm:text-right">
                {/* You can add your company logo here if desired */}
                {/* <Image src="/logo.png" alt="Company Logo" width={100} height={40} /> */}
                <Badge
                  variant={
                    order.status === OrderStatus.COMPLETED
                      ? 'default'
                      : 'secondary'
                  }
                  className={`${order.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-700 border-green-300' : 'bg-amber-100 text-amber-700 border-amber-300'} px-2.5 py-1 text-xs sm:text-sm`}
                >
                  Status:{' '}
                  {order.status.charAt(0).toUpperCase() +
                    order.status.slice(1).toLowerCase()}
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 sm:p-8 space-y-8">
            {/* Event Info Section */}
            <section>
              <h2 className="text-lg font-semibold mb-3 text-slate-700 dark:text-slate-200">
                Event Details
              </h2>
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg border dark:border-slate-700">
                <Image
                  src={order.event.imageUrl || defaultEventImageUrl}
                  alt={order.event.name || 'Event image'}
                  width={100}
                  height={100}
                  className="rounded-md object-cover w-full sm:w-24 h-24 sm:h-auto flex-shrink-0"
                />
                <div className="text-center sm:text-left">
                  <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                    {order.event.name}
                  </h3>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 space-y-0.5">
                    <p className="flex items-center justify-center sm:justify-start">
                      <CalendarDays
                        size={14}
                        className="mr-1.5 flex-shrink-0"
                      />{' '}
                      {getDateFormatter(new Date(order.event.startDate))}{' '}
                      {order.event.startTime
                        ? `at ${new Date(order.event.startTime).toLocaleTimeString()}`
                        : ''}
                    </p>
                    <p className="flex items-center justify-center sm:justify-start">
                      <MapPin size={14} className="mr-1.5 flex-shrink-0" />{' '}
                      {order.event.venue}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Tickets Summary Table */}
            <section>
              <h2 className="text-lg font-semibold mb-3 text-slate-700 dark:text-slate-200">
                Items Purchased
              </h2>
              <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100 dark:bg-slate-800/50">
                      <TableHead className="pl-4 py-3">Ticket Type</TableHead>
                      <TableHead className="text-center py-3">
                        Quantity
                      </TableHead>
                      <TableHead className="text-right py-3">
                        Unit Price
                      </TableHead>
                      <TableHead className="text-right pr-4 py-3">
                        Total
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aggregatedTicketData.map((item) => (
                      <TableRow
                        key={item.key}
                        className="dark:border-slate-700/50"
                      >
                        <TableCell className="font-medium pl-4 py-3">
                          {item.name}
                        </TableCell>
                        <TableCell className="text-center py-3">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right py-3">
                          {getFormattedCurrency(item.pricePerTicket)}
                        </TableCell>
                        <TableCell className="text-right font-semibold pr-4 py-3">
                          {getFormattedCurrency(item.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="bg-slate-100 dark:bg-slate-800/50 font-semibold border-t dark:border-slate-700">
                    <TableRow className="dark:border-slate-700/50">
                      <TableCell colSpan={3} className="text-right pl-4 py-2.5">
                        Subtotal
                      </TableCell>
                      <TableCell className="text-right pr-4 py-2.5">
                        {getFormattedCurrency(overallSubtotalFromAggregation)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="dark:border-slate-700/50">
                      <TableCell colSpan={3} className="text-right pl-4 py-2.5">
                        Fees
                      </TableCell>
                      <TableCell className="text-right pr-4 py-2.5">
                        {getFormattedCurrency(overallFeesFromAggregation)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="dark:border-slate-700/50 text-lg">
                      <TableCell colSpan={3} className="text-right pl-4 py-3">
                        Grand Total (USD)
                      </TableCell>
                      <TableCell className="text-right pr-4 py-3 font-bold">
                        {getFormattedCurrency(grandTotal)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </section>

            {/* Billing Information */}
            <section>
              <h2 className="text-lg font-semibold mb-3 text-slate-700 dark:text-slate-200">
                Billing Information
              </h2>
              <div className="text-sm p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg border dark:border-slate-700 space-y-1">
                <p>
                  <strong className="text-slate-500 dark:text-slate-400 w-28 inline-block">
                    Name:
                  </strong>{' '}
                  {order.firstName || order.name} {order.lastName || ''}
                </p>
                <p>
                  <strong className="text-slate-500 dark:text-slate-400 w-28 inline-block">
                    Email:
                  </strong>{' '}
                  {order.email}
                </p>
                {order.billingAddress1 && (
                  <p>
                    <strong className="text-slate-500 dark:text-slate-400 w-28 inline-block">
                      Address:
                    </strong>{' '}
                    {order.billingAddress1}
                    {order.billingAddress2
                      ? `, ${order.billingAddress2}`
                      : ''}, {order.billingCity}, {order.billingState}{' '}
                    {order.billingZip}, {order.billingCountry}
                  </p>
                )}
                {order.cardLast4 && (
                  <p className="mt-1">
                    <strong className="text-slate-500 dark:text-slate-400 w-28 inline-block">
                      Payment:
                    </strong>{' '}
                    Card ending in **** {order.cardLast4} (
                    {order.cardType || 'Card'})
                  </p>
                )}
              </div>
            </section>

            {/* Actions */}
            <section className="text-center space-y-3 pt-6 border-t dark:border-slate-700">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                You can access your tickets and view event details from your
                main order page.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Link href={`/orders/${order.id}`}>
                    {' '}
                    {/* Link to the general order details page */}
                    <TicketIconLucide className="mr-2 h-5 w-5" /> View Order &
                    Tickets
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/">
                    <Home className="mr-2 h-5 w-5" /> Back to Homepage
                  </Link>
                </Button>
              </div>
            </section>
          </CardContent>
          <CardFooter className="p-6 bg-slate-100 dark:bg-slate-800 border-t dark:border-slate-700 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 mx-auto">
              If you have any questions about your order, please{' '}
              <Link
                href="/contact-support"
                className="underline hover:text-primary"
              >
                contact support
              </Link>{' '}
              with your Order ID: #{order.id.toUpperCase()}.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
