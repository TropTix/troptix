import { Prisma } from '@troptix/db';

export function getPrismaCreateTicketTypeQuery(ticket) {
  let ticketInput: Prisma.TicketTypesCreateInput;
  ticketInput = {
    id: ticket.id,
    name: ticket.name,
    description: ticket.description,
    maxPurchasePerUser: ticket.maxPurchasePerUser,
    quantity: ticket.quantity,
    saleStartDate: ticket.saleStartDate,
    saleEndDate: ticket.saleEndDate,
    price: ticket.price,
    ticketingFees: ticket.ticketingFees,
    discountCode: ticket.discountCode,
    event: {
      connect: {
        id: ticket.eventId,
      },
    },
  };

  return ticketInput;
}

export function getPrismaTicketTypeQuery(ticket) {
  let ticketInput: Prisma.TicketTypesUpdateInput;
  ticketInput = {
    id: ticket.id,
    name: ticket.name,
    ticketType: ticket.ticketType,
    description: ticket.description,
    maxPurchasePerUser: ticket.maxPurchasePerUser,
    quantity: ticket.quantity,
    saleStartDate: ticket.saleStartDate,
    saleEndDate: ticket.saleEndDate,
    price: ticket.price,
    ticketingFees: ticket.ticketingFees,
    discountCode: ticket.discountCode,
    event: {
      connect: {
        id: ticket.eventId,
      },
    },
  };

  return ticketInput;
}
