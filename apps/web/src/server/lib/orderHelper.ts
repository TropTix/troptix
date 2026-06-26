import { OrderStatus, Prisma, TicketStatus, TicketType } from '@troptix/db';
import Stripe from 'stripe';

export function updateSuccessfulOrder(
  paymentMethod: Stripe.PaymentMethod | null
) {
  let orderUpdate: Prisma.OrdersUpdateInput;

  orderUpdate = {
    status: OrderStatus.COMPLETED,
    cardType: paymentMethod?.card?.brand ?? null,
    cardLast4: paymentMethod?.card?.last4 ?? null,
    tickets: {
      updateMany: {
        where: {
          status: TicketStatus.NOT_AVAILABLE,
        },
        data: {
          status: TicketStatus.AVAILABLE,
        },
      },
    },
  };

  return orderUpdate;
}

export function updateTicketTypeQuantitySold(quantitySold) {
  let ticketTypeUpdate: Prisma.TicketTypesUpdateInput;

  ticketTypeUpdate = {
    quantitySold: {
      increment: quantitySold,
    },
  };

  return ticketTypeUpdate;
}

export function getPrismaCreateOrderQuery(order, isFreeOrder = false) {
  let orderInput: Prisma.OrdersCreateInput;
  let orderTickets: Prisma.TicketsCreateManyOrderInput[] = [];

  for (const ticket of order.tickets) {
    let ticketInput: Prisma.TicketsCreateManyOrderInput = {
      id: ticket.id,
      eventId: ticket.eventId,
      ticketTypeId: ticket.ticketTypeId,
      status: isFreeOrder ? TicketStatus.AVAILABLE : TicketStatus.NOT_AVAILABLE,
      ticketsType: isFreeOrder ? TicketType.FREE : TicketType.PAID,
      fees: isFreeOrder ? 0 : ticket.fees,
      subtotal: isFreeOrder ? 0 : ticket.subtotal,
      total: isFreeOrder ? 0 : ticket.total,
      firstName: order.firstName,
      lastName: order.lastName,
      email: order.email,
    };

    if (order.userId) {
      ticketInput = {
        ...ticketInput,
        userId: order.userId,
      };
    }

    orderTickets.push(ticketInput);
  }

  orderInput = {
    id: order.id,
    stripePaymentId: order.stripePaymentId,
    stripeCustomerId: order.stripeCustomerId,
    total: order.total,
    fees: order.fees,
    subtotal: order.subtotal,
    status: isFreeOrder ? OrderStatus.COMPLETED : OrderStatus.PENDING,
    name: order.name,
    firstName: order.firstName,
    lastName: order.lastName,
    email: order.email,
    telephoneNumber: order.telephoneNumber,
    billingAddress1: order.billingAddress1,
    billingAddress2: order.billingAddress2,
    billingCity: order.billingCity,
    billingCountry: order.billingCountry,
    billingZip: order.billingZip,
    billingState: order.billingState,
    ticketsLink: order.ticketsLink,
    event: {
      connect: {
        id: order.eventId,
      },
    },
    tickets: {
      createMany: {
        data: orderTickets,
      },
    },
  };

  if (order.userId) {
    orderInput = {
      ...orderInput,
      user: {
        connect: {
          id: order.userId,
        },
      },
    };
  }

  return orderInput;
}

export function getPrismaCreateComplementaryOrderQuery(order) {
  let orderInput: Prisma.OrdersCreateInput;
  let orderTickets: Prisma.TicketsCreateManyOrderInput[] = [];

  for (const ticket of order.tickets) {
    orderTickets.push({
      id: ticket.id,
      eventId: order.eventId,
      ticketTypeId: ticket.ticketTypeId,
      status: TicketStatus.AVAILABLE,
      ticketsType: TicketType.COMPLEMENTARY,
      total: 0,
      fees: 0,
      subtotal: 0,
      firstName: order.firstName,
      lastName: order.lastName,
      email: order.email,
    });
  }

  orderInput = {
    id: order.id,
    status: OrderStatus.COMPLETED,
    total: 0,
    subtotal: 0,
    fees: 0,
    firstName: order.firstName,
    lastName: order.lastName,
    ticketsLink: order.ticketsLink,
    email: order.email,
    event: {
      connect: {
        id: order.eventId,
      },
    },
    tickets: {
      createMany: {
        data: orderTickets,
      },
    },
  };

  if (order.userId !== undefined) {
    orderInput = {
      ...orderInput,
      user: {
        connect: {
          id: order.userId,
        },
      },
    };
  }

  return orderInput;
}
