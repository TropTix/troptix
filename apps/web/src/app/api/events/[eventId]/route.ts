import prisma from '@/server/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const params = await props.params;
  const { eventId } = params;

  if (!eventId) {
    return NextResponse.json(
      { error: 'Event ID is required' },
      { status: 400 }
    );
  }

  try {
    const event = await prisma.events.findUnique({
      select: {
        id: true,
        name: true,
        startDate: true,
        organizer: true,
        address: true,
      },
      where: {
        id: eventId,
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json(event);
  } catch (error) {
    // This could catch errors like an invalid UUID format for the eventId
    console.error('Error fetching event:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 }
    );
  }
}
