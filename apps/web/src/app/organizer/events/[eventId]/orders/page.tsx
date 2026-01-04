import React from 'react';
import prisma from '@/server/prisma';
import OrderTable from './_components/OrderTable';
import { TicketTypes } from '@prisma/client';
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
import { ShoppingCart, DollarSign, Users, TrendingUp } from 'lucide-react';

interface FetchedTicket {
  id: string;
  ticketType: Pick<TicketTypes, 'name' | 'price'> | null;
}

export interface FetchedOrder {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  subtotal: number;
  createdAt: Date | null;
  telephoneNumber: string | null;
  billingAddress1: string | null;
  billingAddress2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  billingCountry: string | null;
  tickets: FetchedTicket[];
}

async function fetchOrders(
  eventId: string,
  userId: string,
  userEmail?: string
): Promise<FetchedOrder[]> {
  try {
    // Verify access first
    await verifyEventAccess(userId, userEmail, eventId);

    const orders = await prisma.orders.findMany({
      where: {
        eventId: eventId,
        status: 'COMPLETED',
        event: getEventWhereClause(userId, userEmail, eventId),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        subtotal: true,
        createdAt: true,
        telephoneNumber: true,
        billingAddress1: true,
        billingAddress2: true,
        billingCity: true,
        billingState: true,
        billingZip: true,
        billingCountry: true,
        tickets: {
          select: {
            id: true,
            ticketType: {
              select: {
                name: true,
                price: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return orders as FetchedOrder[];
  } catch (error) {
    console.error('Failed to fetch completed orders:', error);
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

function calculateOrderStats(orders: FetchedOrder[]) {
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, order) => sum + order.subtotal, 0);
  const totalTickets = orders.reduce(
    (sum, order) => sum + order.tickets.length,
    0
  );
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return {
    totalOrders,
    totalRevenue,
    totalTickets,
    averageOrderValue,
  };
}

interface EventOrdersPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

// The main page component
export default async function EventOrdersPage(props: EventOrdersPageProps) {
  const params = await props.params;
  const { eventId } = params;
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }
  const initialOrders = await fetchOrders(eventId, user.uid, user.email);
  const eventName = await fetchEventName(eventId, user.uid, user.email);
  const stats = calculateOrderStats(initialOrders);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manage Orders</h1>
        <p className="text-muted-foreground">{eventName}</p>
      </div>

      {/* Desktop Statistics Cards */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
            <p className="text-xs text-muted-foreground">Completed orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(stats.totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">From all orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tickets Sold</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTickets}</div>
            <p className="text-xs text-muted-foreground">Individual tickets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Order Value
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(stats.averageOrderValue)}
            </div>
            <p className="text-xs text-muted-foreground">Revenue per order</p>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Statistics Cards - Horizontal Scroll */}
      <MobileStatsContainer>
        <MobileStatsCard
          icon={ShoppingCart}
          value={stats.totalOrders}
          label="Total Orders"
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
          label="Total Revenue"
        />
        <MobileStatsCard
          icon={Users}
          value={stats.totalTickets}
          label="Tickets Sold"
        />
        <MobileStatsCard
          icon={TrendingUp}
          value={new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            notation: 'compact',
          }).format(stats.averageOrderValue)}
          valueColor="text-lg font-bold"
          label="Avg Order Value"
        />
      </MobileStatsContainer>

      <Card>
        <CardHeader>
          <CardTitle>Order List</CardTitle>
          <CardDescription>
            View and manage all completed orders for this event
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrderTable initialOrders={initialOrders} />
        </CardContent>
      </Card>
    </div>
  );
}
