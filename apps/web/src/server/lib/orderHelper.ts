import { OrderStatus, Prisma, TicketStatus } from '@troptix/db';
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
