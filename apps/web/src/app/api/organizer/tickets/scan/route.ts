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
  const { ticketId, eventId } = await request.json();
  if (!ticketId || !eventId) {
    return NextResponse.json(
      { error: 'ticketId and eventId are required' },
      { status: 400 }
    );
  }

  try {
    const scannedTicket = await updateScannedTicketStatus(ticketId, eventId);
    return NextResponse.json(scannedTicket);
  } catch (error) {
    console.error('Error scanning ticket:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 }
    );
  }
}

async function updateScannedTicketStatus(ticketId: string, eventId: string) {
  if (!eventId || !ticketId) {
    return {
      ticketName: undefined,
      ticketDescription: undefined,
      scanSucceeded: false,
    };
  }

  try {
    const ticket = await prisma.tickets.findUnique({
      where: {
        id: ticketId,
        eventId: eventId,
      },
    });

    if (!ticket) {
      return {
        ticketName: undefined,
        ticketDescription: undefined,
        scanSucceeded: false,
      };
    }

    let ticketType: any = {
      name: 'Complementary',
      description: '',
    };

    if (ticket.ticketTypeId) {
      ticketType = await prisma.ticketTypes.findUnique({
        where: {
          id: ticket.ticketTypeId,
        },
      });
    }

    if (ticket.status === TicketStatus.NOT_AVAILABLE) {
      return {
        ticketName: ticketType.name,
        ticketDescription: ticketType.description,
        scanSucceeded: false,
      };
    } else {
      await prisma.tickets.update({
        where: {
          id: ticketId,
        },
        data: {
          status: TicketStatus.NOT_AVAILABLE,
        },
      });

      return {
        ticketName: ticketType.name,
        ticketDescription: ticketType.description,
        scanSucceeded: true,
      };
    }
  } catch (e) {
    console.error('Request error', e);
    throw e;
  }
}
