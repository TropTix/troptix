import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getDashboard } from '@troptix/api/server';
import {
  dashboardRangeSchema,
  type DashboardRange,
  type DashboardRecentOrder,
  type OrganizerEventSummary,
} from '@troptix/api';
import { CalendarClock, DollarSign, Plus, Ticket } from 'lucide-react';

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
import { PaidWarningBannerOrganizer } from '@/components/PaidWarningBanner';
import { formatCents, getDateFormatter } from '@/lib/dateUtils';
import { DEFAULT_EVENT_IMAGE, eventFlyerUrl } from '@/lib/supabase/storage';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { RangeSelect } from './_components/RangeSelect';
import { RANGE_LABELS } from './_components/ranges';
import { TicketSalesChart } from './_components/TicketSalesChart';

export default async function OrganizerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAs?: string; range?: string }>;
}) {
  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }

  const { viewAs, range: rawRange } = await searchParams;
  // An unknown ?range simply falls back to the service's default.
  const range = dashboardRangeSchema.safeParse(rawRange).data;

  // `viewAs` is honored only for a Platform Owner; the service decides.
  const dashboard = await getDashboard(prisma, userToActor(user), {
    viewAsOrganizerUserId: viewAs,
    range,
  });

  const { activeEvents, recentOrders, stats, salesSeries, setup } = dashboard;
  const rangeLabel = RANGE_LABELS[dashboard.range];

  return (
    <div className="space-y-8">
      {!setup.paidTicketingEnabled && <PaidWarningBannerOrganizer />}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
          <RangeSelect value={dashboard.range} />
          <Button asChild>
            <Link href="/organizer/events/new">
              <Plus className="mr-2 h-4 w-4" />
              Create event
            </Link>
          </Button>
        </div>
      </div>

      <ActiveEvents events={activeEvents} />

      <section className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Ticket revenue"
          value={formatCents(stats.revenueCents)}
          hint={`${rangeLabel} · before fees & refunds`}
          icon={<DollarSign className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          label="Tickets sold"
          value={stats.ticketsSold.toLocaleString()}
          hint={rangeLabel}
          icon={<Ticket className="h-5 w-5 text-muted-foreground" />}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <section className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ticket sales</CardTitle>
              <CardDescription>{rangeLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              <TicketSalesChart
                data={salesSeries}
                bucket={
                  dashboard.range === 'today' || dashboard.range === 'yesterday'
                    ? 'hour'
                    : 'day'
                }
              />
            </CardContent>
          </Card>
        </section>

        <section className="lg:col-span-1">
          <RecentOrders orders={recentOrders} />
        </section>
      </div>
    </div>
  );
}

function StatCard({
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

function ActiveEvents({ events }: { events: OrganizerEventSummary[] }) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CalendarClock className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No active events</p>
            <p className="text-sm text-muted-foreground">
              Create an event to start selling tickets.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/organizer/events/new">Create your first event</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Active events</h2>
        <Link
          href="/organizer/events"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => (
          <ActiveEventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}

function ActiveEventCard({ event }: { event: OrganizerEventSummary }) {
  const soldPercent =
    event.capacity > 0 ? (event.sold / event.capacity) * 100 : 0;
  // Rows store a bucket path, not a URL — resolve it the way the public card does.
  const flyerUrl = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;

  return (
    <Link href={`/organizer/events/${event.id}`} className="group">
      <Card className="h-full transition-colors group-hover:border-primary/50">
        <CardContent className="flex gap-4 p-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
            <Image
              src={flyerUrl}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-medium" title={event.name}>
                {event.name}
              </p>
              <Badge variant="outline" className="shrink-0">
                {event.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {getDateFormatter(new Date(event.startsAt), 'MMM d, yyyy')}
            </p>
            <div className="space-y-1 pt-1">
              <Progress value={soldPercent} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {event.sold.toLocaleString()} /{' '}
                {event.capacity.toLocaleString()} sold
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function RecentOrders({ orders }: { orders: DashboardRecentOrder[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent orders</CardTitle>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No orders yet.
          </p>
        ) : (
          // Deliberately not links: `/orders/[id]` is the patron's view of their
          // own order, not an organizer surface. The organizer's order detail is
          // Screen G's to define — wire the rail up to it then.
          <ul className="divide-y">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex items-center justify-between gap-3 py-3"
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
