'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/prisma';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { TicketStatus } from '@troptix/db';
import { getEventWhereClause, verifyEventAccess } from '@/server/accessControl';

export async function toggleTicketStatus(ticketId: string, eventId: string) {
  try {
    // Get the authenticated user
    const user = await getUserFromIdTokenCookie();
    if (!user) {
      throw new Error('User not authenticated');
    }
    const userId = user.uid;
    const userEmail = user.email;
    await verifyEventAccess(userId, userEmail, eventId);

    // First, get the current ticket to check ownership and current status
    const ticket = await prisma.tickets.findFirst({
      where: {
        id: ticketId,
        eventId: eventId,
        event: getEventWhereClause(userId, userEmail, eventId),
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found or unauthorized');
    }

    // Toggle the status
    const newStatus: TicketStatus =
      ticket.status === TicketStatus.AVAILABLE
        ? TicketStatus.NOT_AVAILABLE
        : TicketStatus.AVAILABLE;

    // Update the ticket status
    const updatedTicket = await prisma.tickets.update({
      where: {
        id: ticketId,
      },
      data: {
        status: newStatus,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
      },
    });

    // Revalidate the attendees page to reflect the changes
    revalidatePath(`/organizer/events/${eventId}/attendees`);

    return {
      success: true,
      data: updatedTicket,
    };
  } catch (error) {
    console.error('Error toggling ticket status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
