'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/prisma';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { TicketStatus } from '@troptix/db';
import { getEventWhereClause, verifyEventAccess } from '@/server/accessControl';

export async function toggleTicketStatus(ticketId: string, eventId: string) {
  try {
    const user = await getUserFromIdTokenCookie();
    if (!user) {
      throw new Error('User not authenticated');
    }
    await verifyEventAccess(user, eventId);

    const ticket = await prisma.tickets.findFirst({
      where: {
        id: ticketId,
        eventId: eventId,
        event: getEventWhereClause(user, eventId),
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found or unauthorized');
    }

    const newStatus: TicketStatus =
      ticket.status === TicketStatus.AVAILABLE
        ? TicketStatus.NOT_AVAILABLE
        : TicketStatus.AVAILABLE;

    const updatedTicket = await prisma.tickets.update({
      where: {
        id: ticketId,
      },
      data: {
        status: newStatus,
        checkinTimestamp:
          newStatus === TicketStatus.NOT_AVAILABLE ? new Date() : null,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
      },
    });

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
