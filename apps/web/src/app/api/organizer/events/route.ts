import { isPlatformOwner } from '@/server/accessControl';
import { extractOrganizer } from '@/server/organizerAuth';
import prisma from '@/server/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
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

  try {
    const whereClause = isPlatformOwner(organizerId.email)
      ? {}
      : { organizerUserId: organizerId.uid };

    const events = await prisma.events.findMany({
      select: {
        id: true,
        imageUrl: true,
        name: true,
        startDate: true,
        organizer: true,
        venue: true,
        address: true,
        isDraft: false,
      },
      where: whereClause,
      orderBy: {
        startDate: 'desc', // Optional: order events by start date
      },
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 }
    );
  }
}
