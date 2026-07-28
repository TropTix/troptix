'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/prisma';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import {
  toggleTicketCheckIn,
  NotFoundError,
  type Actor,
} from '@troptix/api/server';

// Thin adapter over the check-in seam (ADR 0013): the service owns
// authorization (event ownership; no platform-owner bypass on writes) and the
// status/timestamp flip. The action maps errors and revalidates.
export async function toggleTicketStatus(ticketId: string, eventId: string) {
  try {
    const user = await getUserFromIdTokenCookie();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const actor: Actor = {
      kind: 'user',
      userId: user.uid,
      role: user.role ?? 'PATRON',
    };
    const updatedTicket = await toggleTicketCheckIn(prisma, actor, {
      ticketId,
      eventId,
    });

    // Revalidate the attendees page to reflect the changes
    revalidatePath(`/organizer/events/${eventId}/attendees`);

    return {
      success: true,
      data: { id: updatedTicket.id, status: updatedTicket.status },
    };
  } catch (error) {
    console.error('Error toggling ticket status:', error);
    return {
      success: false,
      error:
        error instanceof NotFoundError
          ? 'Ticket not found or unauthorized'
          : error instanceof Error
            ? error.message
            : 'Unknown error occurred',
    };
  }
}
