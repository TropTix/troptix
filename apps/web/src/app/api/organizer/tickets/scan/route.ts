import { getUserFromIdTokenCookie } from '@/server/authUser';
import { canAccessEvent } from '@/server/accessControl';
import prisma from '@/server/prisma';
import { scanTicketSchema } from '@/lib/schemas/organizerApiSchemas';
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
  const parsed = scanTicketSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ticketId and eventId are required' },
      { status: 400 }
    );
  }
  const { ticketId, eventId } = parsed.data;

  // 3. Authorize: the caller must own the event (or be a platform owner).
  const hasAccess = await canAccessEvent(
    organizerId.uid,
    organizerId.email,
    eventId
  );
  if (!hasAccess) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
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
  const failed = {
    ticketName: undefined as string | undefined,
    ticketDescription: undefined as string | undefined,
    scanSucceeded: false,
  };

  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId, eventId },
    include: { ticketType: true },
  });

  if (!ticket) {
    return failed;
  }

  const ticketName = ticket.ticketType?.name ?? 'Complementary';
  const ticketDescription = ticket.ticketType?.description ?? '';

  // Atomic check-then-flip: only the request that finds the ticket still
  // AVAILABLE flips it, so two simultaneous scans can't both succeed.
  const result = await prisma.tickets.updateMany({
    where: { id: ticketId, eventId, status: TicketStatus.AVAILABLE },
    data: { status: TicketStatus.NOT_AVAILABLE, checkinTimestamp: new Date() },
  });

  return {
    ticketName,
    ticketDescription,
    scanSucceeded: result.count === 1,
  };
}
