// DEPRECATED: legacy REST route for the old `apps/organizer` app; slated for
// deletion with that app once v2's check-in is wired to a tRPC mutation.
// See docs/plans/2026-07-organizer-dashboard-migration.md. Don't build on this.
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { isPlatformOwner } from '@/server/accessControl';
import prisma from '@/server/prisma';
import { checkInTicketSchema } from '@/lib/schemas/organizerApiSchemas';
import { TicketStatus } from '@troptix/db';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(request: NextRequest) {
  // 1. Authenticate the user
  const headersList = await headers();
  const authorization = headersList.get('authorization');
  const token = authorization?.split(' ')[1];

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const organizerId = await getUserFromIdTokenCookie(token);
  if (!organizerId) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  // 2. Validate the request body
  const parsed = checkInTicketSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ticketId is required' },
      { status: 400 }
    );
  }
  const { ticketId } = parsed.data;

  try {
    // 3. Find the ticket and verify organizer ownership
    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      include: { event: true }, // Include event to check organizerUserId
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Security Check: the caller must own this ticket's event, or be a platform
    // owner (consistent with the events/orders routes).
    if (
      !isPlatformOwner(organizerId.email) &&
      ticket.event.organizerUserId !== organizerId.uid
    ) {
      return NextResponse.json(
        {
          error: 'Forbidden: You do not have permission to modify this ticket.',
        },
        { status: 403 }
      );
    }

    // 4. Toggle check-in: flip status and record/clear the check-in time.
    const checkingIn = ticket.status === 'AVAILABLE';
    const updatedTicket = await prisma.tickets.update({
      where: {
        id: ticketId,
      },
      data: {
        status: checkingIn ? 'NOT_AVAILABLE' : 'AVAILABLE',
        checkinTimestamp: checkingIn ? new Date() : null,
      },
    });

    return NextResponse.json(updatedTicket);
  } catch (error) {
    console.error('Error checking in ticket:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 }
    );
  }
}
