// DEPRECATED: legacy REST route for the old `apps/organizer` app; slated for
// deletion with that app once v2's check-in is wired to a tRPC mutation.
// See docs/plans/2026-07-organizer-dashboard-migration.md. Don't build on this.
//
// Thin adapter only — authorization and the toggle live in the
// `toggleTicketCheckIn` service (ownership-only, ADR 0013; no platform-owner
// bypass on writes, ADR 0018).
import { getUserFromIdTokenCookie } from '@/server/authUser';
import prisma from '@/server/prisma';
import {
  toggleTicketCheckIn,
  NotFoundError,
  type Actor,
} from '@troptix/api/server';
import { checkInTicketSchema } from '@/lib/schemas/organizerApiSchemas';
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

  const user = await getUserFromIdTokenCookie(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  // 2. Validate the request body
  const parsed = checkInTicketSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ticketId is required' },
      { status: 400 }
    );
  }
  const { ticketId } = parsed.data;

  // 3. The service authorizes (ticket -> event ownership) and toggles.
  const actor: Actor = {
    kind: 'user',
    userId: user.uid,
    role: user.role ?? 'PATRON',
  };
  try {
    const updatedTicket = await toggleTicketCheckIn(prisma, actor, {
      ticketId,
    });
    return NextResponse.json(updatedTicket);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    console.error('Error checking in ticket:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 }
    );
  }
}
