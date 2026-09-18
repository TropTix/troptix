// DEPRECATED: legacy REST route for the old `apps/organizer` app; slated for
// deletion (docs/plans/2026-07-organizer-dashboard-migration.md). Don't build on this.
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import prisma from '@/server/prisma';
import {
  toggleTicketCheckIn,
  ConflictError,
  NotFoundError,
} from '@troptix/api/server';
import { checkInTicketSchema } from '@/lib/schemas/organizerApiSchemas';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(request: NextRequest) {
  const headersList = await headers();
  const authorization = headersList.get('authorization');
  const token = authorization?.split(' ')[1];

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getUserFromIdTokenCookie(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  const parsed = checkInTicketSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ticketId is required' },
      { status: 400 }
    );
  }
  const { ticketId } = parsed.data;

  try {
    const updatedTicket = await toggleTicketCheckIn(prisma, userToActor(user), {
      ticketId,
    });
    return NextResponse.json(updatedTicket);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error checking in ticket:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 }
    );
  }
}
