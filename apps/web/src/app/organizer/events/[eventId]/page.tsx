import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowUpRight,
  DollarSign,
  Edit,
  Eye,
  ScanLine,
  ShoppingCart,
  Ticket,
} from 'lucide-react';
import { getEventOverview, NotFoundError } from '@troptix/api/server';
import type {
  EventOverview,
  EventTierBreakdown,
  DashboardRecentOrder,
} from '@troptix/api';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { requireOrganizerActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { formatCents, getDateFormatter } from '@/lib/dateUtils';
import { DailyRevenueChart } from './_components/DailyRevenueChart';

const STATUS_VARIANT = {
  Active: 'default',
  Upcoming: 'outline',
  Past: 'secondary',
  Draft: 'secondary',
} as const;

export default async function EventOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const actor = await requireOrganizerActor();

  const { eventId } = await params;
  const { viewAs } = await searchParams;

  let overview: EventOverview;
  try {
    overview = await getEventOverview(prisma, actor, eventId, {
      viewAsOrganizerUserId: viewAs,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { event, vitals, revenueSeries, tiers, checkIn, recentOrders } =
    overview;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
            <Badge variant={STATUS_VARIANT[event.status]}>{event.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {getDateFormatter(new Date(event.startsAt), 'EEE, MMM d, yyyy')}
            {event.venue ? ` · ${event.venue}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/events/${event.id}`} target="_blank" rel="noopener">
              <Eye className="mr-2 h-4 w-4" />
              View public
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/organizer/events/${event.id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <VitalCard
          label="Tickets sold"
          value={vitals.sold.toLocaleString()}
          hint={`of ${vitals.capacity.toLocaleString()} capacity`}
          icon={<Ticket className="h-5 w-5 text-muted-foreground" />}
        />
        <VitalCard
          label="Ticket revenue"
          value={formatCents(vitals.revenueCents)}
          hint="before fees & refunds"
          icon={<DollarSign className="h-5 w-5 text-muted-foreground" />}
        />
        <VitalCard
          label="Orders"
          value={vitals.ordersCount.toLocaleString()}
          hint="completed"
          icon={<ShoppingCart className="h-5 w-5 text-muted-foreground" />}
        />
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Revenue</CardTitle>
          <CardDescription>Daily, since this event was created</CardDescription>
        </CardHeader>
        <CardContent>
          <DailyRevenueChart
            data={revenueSeries.map((point) => ({
              date: point.at.slice(0, 10),
              revenue: point.revenueCents / 100,
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <TicketOverview tiers={tiers} />
        </section>
        <section className="space-y-6">
          <CheckInCard
            checkedIn={checkIn.checkedIn}
            total={checkIn.total}
            eventId={event.id}
          />
          <RecentOrders orders={recentOrders} eventId={event.id} />
        </section>
      </div>
    </div>
  );
}

function VitalCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl">{value}</CardTitle>
        </div>
        <span className="shrink-0">{icon}</span>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function TicketOverview({ tiers }: { tiers: EventTierBreakdown[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Ticket types</CardTitle>
      </CardHeader>
      <CardContent>
        {tiers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No ticket types yet.
          </p>
        ) : (
          <ul className="divide-y">
            {tiers.map((tier) => {
              const percent =
                tier.capacity > 0 ? (tier.sold / tier.capacity) * 100 : 0;
              return (
                <li key={tier.id} className="space-y-2 py-3 first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{tier.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatCents(tier.revenueCents)}
                    </span>
                  </div>
                  <Progress value={percent} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {tier.sold.toLocaleString()} /{' '}
                    {tier.capacity.toLocaleString()} sold
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CheckInCard({
  checkedIn,
  total,
  eventId,
}: {
  checkedIn: number;
  total: number;
  eventId: string;
}) {
  const percent = total > 0 ? (checkedIn / total) * 100 : 0;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Check-in</CardTitle>
        <Link
          href={`/organizer/events/${eventId}/attendees`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          <ScanLine className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-2xl font-semibold">
          {checkedIn.toLocaleString()}{' '}
          <span className="text-base font-normal text-muted-foreground">
            of {total.toLocaleString()} checked in
          </span>
        </p>
        <Progress value={percent} className="h-1.5" />
      </CardContent>
    </Card>
  );
}

function RecentOrders({
  orders,
  eventId,
}: {
  orders: DashboardRecentOrder[];
  eventId: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Recent orders</CardTitle>
        <Link
          href={`/organizer/events/${eventId}/orders`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          View all
          <ArrowUpRight className="ml-0.5 h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No orders yet.
          </p>
        ) : (
          // Not links: /orders/[id] is the patron's view, and the organizer's
          // order detail is the Orders tab (Screen G), reached via View all.
          <ul className="divide-y">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium"
                    title={order.customerDisplay}
                  >
                    {order.customerDisplay}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.createdAt
                      ? getDateFormatter(new Date(order.createdAt), 'MMM d')
                      : '—'}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium">
                  {formatCents(order.amountChargedCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
