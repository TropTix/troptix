import { canAccessEvent } from '@/server/accessControl';
import { extractOrganizer } from '@/server/organizerAuth';
import prisma from '@/server/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ eventId: string }> }
) {
  const params = await props.params;
  const auth = await extractOrganizer();

  if (!auth.ok) {
    return auth.failure === 'missing-token'
      ? NextResponse.json(
          { error: 'Authorization header is missing or invalid' },
          { status: 401 }
        )
      : NextResponse.json(
          { error: 'Invalid token or user not found' },
          { status: 403 }
        );
  }

  const organizerId = auth.user;
  const { eventId } = params;

  if (!eventId) {
    return NextResponse.json(
      { error: 'Event ID is required' },
      { status: 400 }
    );
  }

  const hasAccess = await canAccessEvent(
    organizerId.uid,
    organizerId.email,
    eventId
  );
  if (!hasAccess) {
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
