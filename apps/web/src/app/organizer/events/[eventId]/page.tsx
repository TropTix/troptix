import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Ticket,
  Users,
  DollarSign,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  Copy,
  Clock,
  CalendarDays,
  Filter,
  Search,
  MapPin,
  Calendar,
  TrendingUp,
  CheckCheck,
} from 'lucide-react';
import { differenceInDays, format, isValid } from 'date-fns'; // For date calculations

import { getEventOverview, type EventOverview } from './_lib/getEventOverview';
import { DailyRevenueChart } from './_components/DailyRevenueChart';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import {
  MobileStatsCard,
  MobileStatsContainer,
} from '@/components/ui/mobile-stats-card';
import { CopyButton } from '@/components/ui/copy-button';
import { Progress } from '@/components/ui/progress';
import { hasPlatformAccess } from '@/server/accessControl';

function getEventStatusDisplay(eventData: EventOverview) {
  const { event, timing } = eventData;
  
  if (event.status === 'draft') {
    return { label: 'Draft', variant: 'secondary' as const };
  }
  
  if (timing.eventPhase === 'live') {
    return { label: 'Live Now', variant: 'default' as const };
  }
  
  if (timing.eventPhase === 'ended') {
    return { label: 'Event Ended', variant: 'outline' as const };
  }
  
  if (typeof timing.daysUntilEvent === 'number') {
    if (timing.daysUntilEvent === 0) {
      return { label: 'Starts Today', variant: 'default' as const };
    }
    if (timing.daysUntilEvent === 1) {
      return { label: 'Starts Tomorrow', variant: 'default' as const };
    }
    return { 
      label: `${timing.daysUntilEvent} days until event`, 
      variant: 'outline' as const 
    };
  }
  
  return { label: 'Published', variant: 'outline' as const };
}

export default async function EventOverviewPage(
  props: {
    params: Promise<{ eventId: string }>;
  }
) {
  const params = await props.params;
  const eventId = params.eventId;
  let eventData;
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  try {
    eventData = await getEventOverview(eventId, user.uid, user.email);
  } catch (error) {
    console.error('Failed to fetch event data:', error);
    return <p>Error loading event data.</p>;
  }

  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/events/${eventId}`;
  const statusDisplay = getEventStatusDisplay(eventData);
  const isPlatformOwner = hasPlatformAccess(user.email);

  return (
    <div className="flex flex-col space-y-4">
      <section className="flex flex-col gap-3 md:gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={statusDisplay.variant}>{statusDisplay.label}</Badge>
                {isPlatformOwner && (
                  <Badge variant="secondary" className="text-xs">
                    Platform Access
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Created: {format(eventData.event.createdAt, 'PP')}
                </span>
              </div>
              
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {format(eventData.event.startDate, 'PPP')}
                    {eventData.event.startTime && (
                      <span className="ml-1">
                        at {format(eventData.event.startTime, 'p')}
                      </span>
                    )}
                  </span>
                </div>
                
                {eventData.event.venue && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{eventData.event.venue}</span>
                  </div>
                )}
              </div>
            </div>
            
            <Link href={`/events/${eventId}`} passHref legacyBehavior>
              <a target="_blank" rel="noopener noreferrer">
                <Button variant="outline">View Event Page</Button>
              </a>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5">
          <Input
            readOnly
            value={eventUrl}
            className="flex-grow border-none bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 h-auto text-sm"
          />
          <CopyButton text={eventUrl} />
        </div>
      </section>

      {/* Desktop Statistics Cards */}
      <section className="hidden sm:grid sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tickets Sold</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {eventData.tickets.totalSold.toLocaleString()}
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Capacity</span>
                <span>{eventData.tickets.capacityUsed.toFixed(0)}%</span>
              </div>
              <Progress value={eventData.tickets.capacityUsed} className="h-1" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${eventData.financials.totalRevenue.toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              ${eventData.financials.averageOrderValue.toFixed(0)} avg order
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Ticket Type</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {eventData.tickets.topSellingType ? (
              <>
                <div className="text-2xl font-bold">
                  {eventData.tickets.topSellingType.sold}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {eventData.tickets.topSellingType.name}
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-muted-foreground">-</div>
                <p className="text-xs text-muted-foreground">No sales yet</p>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales Velocity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {eventData.timing.salesVelocity.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">tickets/day</p>
          </CardContent>
        </Card>
      </section>

      {/* Mobile Statistics Cards - Horizontal Scroll */}
      <MobileStatsContainer>
        <MobileStatsCard
          icon={Ticket}
          value={eventData.tickets.totalSold.toLocaleString()}
          label="Tickets Sold"
          secondaryInfo={`${eventData.tickets.capacityUsed.toFixed(0)}% filled`}
        />
        <MobileStatsCard
          icon={DollarSign}
          iconColor="text-green-600"
          value={new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            notation: 'compact',
          }).format(eventData.financials.totalRevenue)}
          valueColor="text-lg font-bold text-green-600"
          label="Revenue"
          secondaryInfo={`$${eventData.financials.averageOrderValue.toFixed(0)} avg`}
        />
        <MobileStatsCard
          icon={TrendingUp}
          value={eventData.tickets.topSellingType?.name || 'None'}
          label="Top Ticket"
          secondaryInfo={eventData.tickets.topSellingType ? `${eventData.tickets.topSellingType.sold} sold` : 'No sales'}
        />
        <MobileStatsCard
          icon={Clock}
          value={`${eventData.timing.salesVelocity.toFixed(1)}`}
          label="Sales/Day"
          secondaryInfo="Velocity"
        />
      </MobileStatsContainer>

      {/* Todo: Add logic to handle different time periods */}
      {/* <section className="flex justify-end gap-2">
        <Button variant="outline" size="sm">
          Day
        </Button>
        <Button variant="outline" size="sm">
          Week
        </Button>
        <Button variant="outline" size="sm">
          Month
        </Button>
        <Button variant="outline" size="sm">
          YTD
        </Button>
        <Button variant="secondary" size="sm">
          All Time
        </Button>
      </section> */}

      {/* <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              $
              {eventData.totalRevenue.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Tickets Sold
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {eventData.ticketsSold.toLocaleString()}
            </div>
            {eventData.capacity && eventData.capacity > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                {`out of ${eventData.capacity.toLocaleString()} capacity (${((eventData.ticketsSold / eventData.capacity) * 100).toFixed(0)}%)`}
              </p>
            )}
          </CardContent>
        </Card>
      </section> */}

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Revenue Over Time</CardTitle>
            <CardDescription>
              {eventData.activity.chartDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DailyRevenueChart data={eventData.activity.dailyRevenue} />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Recent Orders</CardTitle>
                <CardDescription>
                  Latest ticket purchases for this event.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {/* TODO: Add search and filter */}
                {/* <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search orders..." className="pl-8" />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                  <span className="sr-only">Filter orders</span>
                </Button> */}
                <Link
                  href={`/organizer/events/${eventId}/orders`}
                  passHref
                  legacyBehavior
                >
                  <Button variant="outline" size="sm" asChild>
                    <a>
                      View All Orders
                      <ArrowUpRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[100px]">Order ID</TableHead>
                    <TableHead className="min-w-[120px]">Customer</TableHead>
                    <TableHead className="text-right min-w-[80px]">
                      Amount
                    </TableHead>
                    <TableHead className="min-w-[100px]">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventData.activity.recentOrders.length > 0 ? (
                    eventData.activity.recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium text-sm">
                          {order.id}
                        </TableCell>
                        <TableCell className="text-sm">
                          {order.customerName}
                          <div className="text-xs text-muted-foreground">
                            {order.ticketCount} ticket{order.ticketCount !== 1 ? 's' : ''}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          ${order.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm">{order.date}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-24 text-center text-muted-foreground"
                      >
                        <Ticket className="mx-auto h-8 w-8 mb-2" />
                        No orders yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      {eventData.tickets.ticketTypes.length > 0 && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Ticket Types Performance</CardTitle>
              <CardDescription>
                Breakdown of sales by ticket type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {eventData.tickets.ticketTypes
                  .filter(tt => tt.sold > 0)
                  .sort((a, b) => b.sold - a.sold)
                  .map((ticketType) => (
                    <div key={ticketType.name} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium truncate">{ticketType.name}</p>
                          <p className="text-sm text-muted-foreground ml-2">
                            {ticketType.sold}/{ticketType.capacity}
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <Progress 
                            value={ticketType.capacity > 0 ? (ticketType.sold / ticketType.capacity) * 100 : 0} 
                            className="flex-1 mr-2 h-2" 
                          />
                          <p className="text-sm font-medium">
                            ${ticketType.revenue.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
