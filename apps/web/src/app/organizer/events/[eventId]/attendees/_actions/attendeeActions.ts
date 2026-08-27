'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/prisma';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import {
  toggleTicketCheckIn,
  ConflictError,
  NotFoundError,
} from '@troptix/api/server';

export async function toggleTicketStatus(ticketId: string) {
  try {
    const user = await getUserFromIdTokenCookie();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const updatedTicket = await toggleTicketCheckIn(prisma, userToActor(user), {
      ticketId,
    });

    revalidatePath(`/organizer/events/${updatedTicket.eventId}/attendees`);

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
          : error instanceof ConflictError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unknown error occurred',
    };
  }
}
