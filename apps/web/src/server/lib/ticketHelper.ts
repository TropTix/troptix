import { Prisma, PrismaClient, TicketStatus } from '@/generated/prisma/client';
import prisma from '@/server/prisma';

const prismaClient = prisma as PrismaClient;

export function getPrismaUpdateTicketQuery(ticket) {
  let updatedTicket: Prisma.TicketsUpdateInput;

  updatedTicket = {
    firstName: ticket.firstName,
    lastName: ticket.lastName,
  };

  return updatedTicket;
}

export function getPrismaUpdateTicketStatusQuery(ticket) {
  let updatedTicket: Prisma.TicketsUpdateInput;

  updatedTicket = {
    status: ticket.status,
  };

  return updatedTicket;
}

export async function updateScannedTicketStatus(
  ticketId: string,
  eventId: string
) {
  if (!eventId || !ticketId) {
    return {
      ticketName: undefined,
      ticketDescription: undefined,
      scanSucceeded: false,
    };
  }

  try {
    const ticket = await prismaClient.tickets.findUnique({
      where: {
        id: ticketId,
        eventId: eventId,
      },
    });

    if (!ticket) {
      return {
        ticketName: undefined,
        ticketDescription: undefined,
        scanSucceeded: false,
      };
    }

    let ticketType: any = {
      name: 'Complementary',
      description: '',
    };

    if (ticket.ticketTypeId) {
      ticketType = await prismaClient.ticketTypes.findUnique({
        where: {
          id: ticket.ticketTypeId,
        },
      });
    }

    if (ticket.status === TicketStatus.NOT_AVAILABLE) {
      return {
        ticketName: ticketType.name,
        ticketDescription: ticketType.description,
        scanSucceeded: false,
      };
    } else {
      await prisma.tickets.update({
        where: {
          id: ticketId,
        },
        data: {
          status: TicketStatus.NOT_AVAILABLE,
        },
      });

      return {
        ticketName: ticketType.name,
        ticketDescription: ticketType.description,
        scanSucceeded: true,
      };
    }
  } catch (e) {
    console.error('Request error', e);
    throw e;
  }
}

export function getPrismaUpdateTicketUserQuery(userId) {
  let updatedTicket: Prisma.TicketsUpdateInput;

  updatedTicket = {
    user: {
      connect: {
        id: userId,
      },
    },
  };

  return updatedTicket;
}
