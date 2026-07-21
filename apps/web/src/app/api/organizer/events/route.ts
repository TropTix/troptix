// DEPRECATED: legacy REST route for the old `apps/organizer` app; slated for
// deletion with that app once v2 fully covers it via tRPC.
// See docs/plans/2026-07-organizer-dashboard-migration.md. Don't build on this.
import { isPlatformOwner } from '@/server/accessControl';
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
    const whereClause = isPlatformOwner(organizerId.email)
      ? {}
      : { organizerUserId: organizerId.uid };

    const events = await prisma.events.findMany({
      select: {
        id: true,
        imageUrl: true,
        name: true,
        startsAt: true,
        organizer: true,
        venue: true,
        address: true,
        isDraft: false,
      },
      where: whereClause,
      orderBy: {
        startsAt: 'desc', // Optional: order events by start date
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
