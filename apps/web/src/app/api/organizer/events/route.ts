import { getUserFromIdTokenCookie } from '@/server/authUser';
import prisma from '@/server/prisma';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
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

  try {
    const events = await prisma.events.findMany({
      select: {
        id: true,
        imageUrl: true,
        name: true,
        startDate: true,
        organizer: true,
        venue: true,
        address: true,
      },
      where: {
        organizerUserId: organizerId.uid,
      },
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
