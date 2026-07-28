// DEPRECATED: legacy REST route for the old `apps/organizer` app; slated for
// deletion with that app once v2 fully covers it via tRPC.
// See docs/plans/2026-07-organizer-dashboard-migration.md. Don't build on this.
import { getUserFromIdTokenCookie } from '@/server/authUser';
import prisma from '@/server/prisma';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ eventId: string }> }
) {
  const params = await props.params;
  const headersList = await headers();
  const authorization = headersList.get('authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authorization header is missing or invalid' },
      { status: 401 }
    );
  }

  const token = authorization.split(' ')[1];
  const organizerId = await getUserFromIdTokenCookie(token);

  if (!organizerId) {
    return NextResponse.json(
      { error: 'Invalid token or user not found' },
      { status: 403 }
    );
  }

  const { eventId } = params;

  if (!eventId) {
    return NextResponse.json(
      { error: 'Event ID is required' },
      { status: 400 }
    );
  }

  // Ownership-only (ADR 0018): the caller must own the event, and a
  // soft-deleted event is gone here like everywhere on the seam.
  const ownedEvent = await prisma.events.findUnique({
    where: { id: eventId, organizerUserId: organizerId.uid, deletedAt: null },
    select: { id: true },
  });
  if (!ownedEvent) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  try {
    const orders = await prisma.orders.findMany({
      where: {
        eventId: eventId,
        status: 'COMPLETED',
      },
      include: {
        tickets: {
          include: {
            ticketType: true,
          },
        },
      },
    });

    if (!orders) {
      return NextResponse.json(
        { error: 'Orders not found for event' },
        { status: 404 }
      );
    }

    return NextResponse.json(orders);
  } catch (error) {
    // This could catch errors like an invalid UUID format for the eventId
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 }
    );
  }
}
