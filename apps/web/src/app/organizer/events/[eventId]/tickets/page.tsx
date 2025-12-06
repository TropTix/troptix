import React from 'react';
import prisma from '@/server/prisma';
import TicketTable from './_components/TicketTable'; // Update the import path to the colocated component
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import { verifyEventAccess, getEventWhereClause } from '@/server/accessControl';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  MobileStatsCard,
  MobileStatsContainer,
} from '@/components/ui/mobile-stats-card';
import { Ticket, DollarSign, Users, TrendingUp } from 'lucide-react';

interface FetchedTicketType {
  id: string;
  name: string;
  price: number;
  quantity: number;
  quantitySold: number | null;
  saleStartDate: Date;
  saleEndDate: Date;
}

async function fetchTicketTypes(
  eventId: string,
  userId: string,
  userEmail?: string
): Promise<FetchedTicketType[]> {
  console.log(`Fetching ticket types for event: ${eventId}`);
  try {
    // Verify access first
    await verifyEventAccess(userId, userEmail, eventId);
    
    const ticketTypes = await prisma.ticketTypes.findMany({
      where: {
        eventId: eventId,
        event: getEventWhereClause(userId, userEmail, eventId),
      },
      select: {
        id: true,
        name: true,
        price: true,
        quantity: true,
        quantitySold: true,
        saleStartDate: true,
        saleEndDate: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return ticketTypes;
  } catch (error) {
    console.error('Failed to fetch ticket types:', error);
    return [];
  }
}

async function fetchEventName(
  eventId: string,
  userId: string,
  userEmail?: string
): Promise<string> {
  try {
    const event = await prisma.events.findFirst({
      where: getEventWhereClause(userId, userEmail, eventId),
      select: {
        name: true,
      },
    });
    return event?.name || 'Unknown Event';
  } catch (error) {
    console.error('Failed to fetch event name:', error);
    return 'Unknown Event';
  }
}

function calculateTicketStats(ticketTypes: FetchedTicketType[]) {
  const totalTypes = ticketTypes.length;
  const totalCapacity = ticketTypes.reduce(
    (sum, ticket) => sum + ticket.quantity,
    0
  );
  const totalSold = ticketTypes.reduce(
    (sum, ticket) => sum + (ticket.quantitySold || 0),
    0
  );
  const totalRevenue = ticketTypes.reduce(
    (sum, ticket) => sum + (ticket.quantitySold || 0) * ticket.price,
    0
  );
  const now = new Date();
  const activeTypes = ticketTypes.filter(
    (ticket) => now >= ticket.saleStartDate && now <= ticket.saleEndDate
  ).length;

  return {
    totalTypes,
    totalCapacity,
    totalSold,
    totalRevenue,
    activeTypes,
  };
}

interface EventTicketsPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function EventTicketsPage(props: EventTicketsPageProps) {
  const params = await props.params;
  const { eventId } = params;
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }
  const initialTicketTypes = await fetchTicketTypes(eventId, user.uid, user.email);
  const eventName = await fetchEventName(eventId, user.uid, user.email);
  const stats = calculateTicketStats(initialTicketTypes);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manage Tickets</h1>
        <p className="text-muted-foreground">{eventName}</p>
      </div>

      {/* Desktop Statistics Cards */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Types</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTypes}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeTypes} currently on sale
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tickets Sold</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSold}</div>
            <p className="text-xs text-muted-foreground">
              of {stats.totalCapacity} available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(stats.totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">From ticket sales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Capacity Used</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalCapacity > 0
                ? Math.round((stats.totalSold / stats.totalCapacity) * 100)
                : 0}
              %
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.totalCapacity - stats.totalSold} remaining
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Statistics Cards - Horizontal Scroll */}
      <MobileStatsContainer>
        <MobileStatsCard
          icon={Ticket}
          value={stats.totalTypes}
          label="Ticket Types"
          secondaryInfo={`${stats.activeTypes} active`}
        />
        <MobileStatsCard
          icon={Users}
          value={stats.totalSold}
          label="Tickets Sold"
          secondaryInfo={`of ${stats.totalCapacity}`}
        />
        <MobileStatsCard
          icon={DollarSign}
          iconColor="text-green-600"
          value={new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            notation: 'compact',
          }).format(stats.totalRevenue)}
          valueColor="text-lg font-bold text-green-600"
          label="Revenue"
        />
        <MobileStatsCard
          icon={TrendingUp}
          value={`${
            stats.totalCapacity > 0
              ? Math.round((stats.totalSold / stats.totalCapacity) * 100)
              : 0
          }%`}
          label="Capacity Used"
          secondaryInfo={`${stats.totalCapacity - stats.totalSold} left`}
        />
      </MobileStatsContainer>

      <Card>
        <CardHeader>
          <CardTitle>Ticket Types</CardTitle>
          <CardDescription>
            Manage ticket types, pricing, and availability for this event
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TicketTable
            eventId={eventId}
            initialTicketTypes={initialTicketTypes}
          />
        </CardContent>
      </Card>
    </div>
  );
}
