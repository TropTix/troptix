import React from 'react';
import prisma from '@/server/prisma';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import AttendeeTable from './_components/AttendeeTable';
import { verifyEventAccess, getEventWhereClause } from '@/server/accessControl';
import { TicketStatus, TicketTypes, Orders } from '@prisma/client';
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
import { Users, UserCheck, UserX, Ticket } from 'lucide-react';

// Define the structure of the data we expect to fetch
export interface FetchedTicketData {
  id: string;
  createdAt: Date | null;
  status: TicketStatus;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  ticketType: Pick<TicketTypes, 'name'> | null;
  order: Pick<Orders, 'id'> | null;
}

async function fetchTickets(eventId: string, userId: string, userEmail?: string) {
  try {
    // Verify access first
    await verifyEventAccess(userId, userEmail, eventId);
    
    const tickets = await prisma.tickets.findMany({
      where: {
        eventId: eventId,
        event: getEventWhereClause(userId, userEmail, eventId),
        order: {
          status: 'COMPLETED',
        },
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        email: true,
        firstName: true,
        lastName: true,
        ticketType: {
          select: {
            name: true,
          },
        },
        order: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return tickets;
  } catch (error) {
    console.error('Failed to fetch tickets:', error);
    return [];
  }
}

async function fetchEventName(eventId: string, userId: string, userEmail?: string) {
  try {
    const event = await prisma.events.findUnique({
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

interface EventAttendeesPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function EventAttendeesPage(props: EventAttendeesPageProps) {
  const params = await props.params;
  const { eventId } = params;
  const user = await getUserFromIdTokenCookie();

  // Redirect to signin if user is not authenticated
  if (!user) {
    redirect('/auth/signin');
  }

  // Fetch the initial list of attendees (tickets) and event info
  const [initialAttendees, eventName] = await Promise.all([
    fetchTickets(eventId, user.uid, user.email),
    fetchEventName(eventId, user.uid, user.email),
  ]);

  // Calculate statistics
  const totalAttendees = initialAttendees.length;
  const checkedInAttendees = initialAttendees.filter(
    (ticket) => ticket.status === 'NOT_AVAILABLE'
  ).length;
  const notCheckedInAttendees = totalAttendees - checkedInAttendees;
  const checkInRate =
    totalAttendees > 0 ? (checkedInAttendees / totalAttendees) * 100 : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manage Attendees</h1>
        <p className="text-muted-foreground">{eventName}</p>
      </div>

      {/* Desktop Statistics Cards */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Attendees
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAttendees}</div>
            <p className="text-xs text-muted-foreground">Tickets sold</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {checkedInAttendees}
            </div>
            <p className="text-xs text-muted-foreground">Currently present</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Not Checked In
            </CardTitle>
            <UserX className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {notCheckedInAttendees}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting check-in</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Check-in Rate</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{checkInRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Attendance rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Statistics Cards - Horizontal Scroll */}
      <MobileStatsContainer>
        <MobileStatsCard
          icon={Users}
          value={totalAttendees}
          label="Total Attendees"
        />
        <MobileStatsCard
          icon={UserCheck}
          iconColor="text-green-600"
          value={checkedInAttendees}
          valueColor="text-xl font-bold text-green-600"
          label="Checked In"
        />
        <MobileStatsCard
          icon={UserX}
          iconColor="text-orange-600"
          value={notCheckedInAttendees}
          valueColor="text-xl font-bold text-orange-600"
          label="Not Checked In"
        />
        <MobileStatsCard
          icon={Ticket}
          value={`${checkInRate.toFixed(1)}%`}
          label="Check-in Rate"
        />
      </MobileStatsContainer>

      {/* Attendee Table */}
      <Card>
        <CardHeader>
          <CardTitle>Attendee List</CardTitle>
          <CardDescription>
            Manage check-in status for all attendees. Click the action buttons
            to check attendees in or out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AttendeeTable attendees={initialAttendees} />
        </CardContent>
      </Card>
    </div>
  );
}
