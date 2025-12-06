import { getUserFromIdTokenCookie } from '@/server/authUser';
import prisma from '@/server/prisma';
import { TicketStatus } from '@prisma/client';
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

  // 2. Get and validate the request body
  const { ticketId } = await request.json();
  if (!ticketId) {
    return NextResponse.json(
      { error: 'ticketId is required' },
      { status: 400 }
    );
  }

  try {
    // 3. Find the ticket and verify organizer ownership
    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      include: { event: true }, // Include event to check organizerUserId
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Security Check: Ensure the authenticated user is the organizer for this ticket's event.
    if (ticket.event.organizerUserId !== organizerId.uid) {
      return NextResponse.json(
        {
          error: 'Forbidden: You do not have permission to modify this ticket.',
        },
        { status: 403 }
      );
    }

    // 4. Determine the new status and update the ticket
    const newStatus: TicketStatus =
      ticket.status === 'AVAILABLE' ? 'NOT_AVAILABLE' : 'AVAILABLE';

    const updatedTicket = await prisma.tickets.update({
      where: {
        id: ticketId,
      },
      data: {
        status: newStatus,
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
