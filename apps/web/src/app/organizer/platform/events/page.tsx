import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Settings,
  Eye,
  Edit,
  Calendar,
  MapPin,
  User,
  DollarSign,
  Ticket,
  ShoppingCart,
  Shield,
} from 'lucide-react';
import {
  getAllPlatformEvents,
  type PlatformEventData,
} from '../_lib/getPlatformEventsData';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';

const getStatusBadgeVariant = (status: PlatformEventData['status']) => {
  switch (status) {
    case 'Active':
      return 'default';
    case 'Upcoming':
      return 'outline';
    case 'Past':
      return 'secondary';
    case 'Draft':
      return 'secondary';
    default:
      return 'secondary';
  }
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export default async function PlatformEventsPage() {
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  const events = await getAllPlatformEvents(user.uid, user.email);

  // Calculate platform-wide stats
  const platformStats = events.reduce(
    (acc, event) => ({
      totalEvents: acc.totalEvents + 1,
      totalRevenue: acc.totalRevenue + event.stats.totalRevenue,
      totalTickets: acc.totalTickets + event.stats.ticketsSold,
      totalOrders: acc.totalOrders + event.stats.totalOrders,
    }),
    { totalEvents: 0, totalRevenue: 0, totalTickets: 0, totalOrders: 0 }
  );

  const statusGroups = events.reduce(
    (acc, event) => {
      acc[event.status] = (acc[event.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Platform Events
            </h1>
            <p className="text-muted-foreground">
              All events across the platform
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-sm">
          Platform Admin
        </Badge>
      </div>

      {/* Platform Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {platformStats.totalEvents}
            </div>
            <p className="text-xs text-muted-foreground">
              {statusGroups.Active || 0} active, {statusGroups.Upcoming || 0}{' '}
              upcoming
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(platformStats.totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              From {platformStats.totalOrders} orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tickets Sold</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {platformStats.totalTickets.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Across all events</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Revenue</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                platformStats.totalEvents > 0
                  ? platformStats.totalRevenue / platformStats.totalEvents
                  : 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">Per event</p>
          </CardContent>
        </Card>
      </div>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Platform Events</CardTitle>
          <CardDescription>
            Complete list of events across the platform with organizer and
            performance data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Organizer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Tickets</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length > 0 ? (
                  events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{event.name}</div>
                          {event.venue && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {event.venue}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {event.organizer.name || 'Unknown'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {event.organizer.email}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(event.status)}>
                          {event.status}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {format(event.startsAt, 'MMM d, yyyy')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(event.startsAt, 'h:mm a')}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="space-y-1">
                          <div className="font-medium">
                            {formatCurrency(event.stats.totalRevenue)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {event.stats.totalOrders} orders
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="font-medium">
                          {event.stats.ticketsSold.toLocaleString()}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/organizer/events/${event.id}`}>
                              <Settings className="h-3 w-3" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/organizer/events/${event.id}/edit`}>
                              <Edit className="h-3 w-3" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              href={`/e/${event.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Eye className="h-3 w-3" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No events found on the platform.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
