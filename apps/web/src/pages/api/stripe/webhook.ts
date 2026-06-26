import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import {
  updateSuccessfulOrder,
  updateTicketTypeQuantitySold,
} from '@/server/lib/orderHelper';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';
import { buffer } from 'micro';
import { OrderStatus } from '@troptix/db';

import { sendEmailConfirmationEmailToUser } from '@/server/lib/email';

// Stripe requires the raw body to construct the event
export const config = {
  api: {
    bodyParser: false,
  },
};

const endpointSecret = process.env.STRIPE_CHARGE_SUCCEEDED_WEBHOOK;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let buf;
    try {
      buf = await buffer(req);
    } catch (error) {
      console.error('[Webhook] Error getting request buffer:', error);
      return res.status(400).json({ error: 'Error getting request buffer' });
    }

    const sig = req.headers['stripe-signature'];

    if (!sig || !endpointSecret) {
      console.error('[Webhook] Missing signature or endpoint secret');
      throw new Error('Missing signature or endpoint secret');
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
    } catch (err) {
      console.error('[Webhook] Signature verification failed:', err);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Handle specific event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[Payment] Success - PaymentIntent: ${paymentIntent.id}`);

        const paymentMethod =
          typeof paymentIntent.payment_method === 'string'
            ? await stripe.paymentMethods.retrieve(paymentIntent.payment_method)
            : null;

        await updateOrderAfterPaymentSucceeds(paymentIntent.id, paymentMethod);
        return res.status(200).json({
          message: 'Payment succeeded and tickets added to database',
        });

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object as Stripe.PaymentIntent;
        console.log(
          `[Payment] Failed - PaymentIntent: ${failedPayment.id}, Error: ${failedPayment.last_payment_error?.message || 'Unknown error'}`
        );
        return res.status(200).json({ message: 'Payment intent failed' });

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
        return res
          .status(400)
          .json({ error: `Unhandled event type ${event.type}` });
    }
  } catch (err) {
    console.error('[Webhook] Handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

async function updateOrderAfterPaymentSucceeds(
  paymentIntentId: string,
  paymentMethod: Stripe.PaymentMethod | null
): Promise<void> {
  try {
    // Step 1: Idempotency guard — no-op if already completed
    const existing = await prisma.orders.findUnique({
      where: { stripePaymentId: paymentIntentId },
      select: { id: true, status: true },
    });
    if (!existing) {
      console.error(
        `[Order] Order not found for PaymentIntent: ${paymentIntentId}`
      );
      throw new Error('Order not found');
    }
    if (existing.status === OrderStatus.COMPLETED) {
      console.log(
        `[Order] ${existing.id} already completed — duplicate webhook delivery, skipping`
      );
      return;
    }

    await prisma.orders.update({
      where: {
        stripePaymentId: paymentIntentId,
      },
      data: updateSuccessfulOrder(paymentMethod),
    });

    const order = await prisma.orders.findUnique({
      where: {
        stripePaymentId: paymentIntentId,
      },
      include: {
        tickets: {
          include: {
            ticketType: true,
          },
        },
        event: true,
      },
    });

    if (!order) {
      console.error(
        `[Order] Order not found for PaymentIntent: ${paymentIntentId}`
      );
      throw new Error('Order not found');
    }

    const orderMap = new Map();
    order.tickets.forEach((ticket) => {
      const ticketId = ticket?.ticketType?.id;
      if (!ticketId) {
        console.error(
          `[Order] ticket ${ticket.id} has no ticketType — skipping quantity update`
        );
        return;
      }
      if (orderMap.has(ticketId)) {
        const existingOrder = orderMap.get(ticketId);
        orderMap.set(ticketId, {
          ...existingOrder,
          ticketQuantity: existingOrder.ticketQuantity + 1,
          ticketTotalPaid: existingOrder.ticketTotalPaid + ticket.total,
        });
      } else {
        orderMap.set(ticketId, {
          ticketQuantity: 1,
          ticketName: ticket?.ticketType?.name || 'Unknown',
          ticketTotalPaid: ticket.total,
        });
      }
    });

    // Update ticket quantities
    for (const [ticketId, value] of Array.from(orderMap.entries())) {
      await prisma.ticketTypes.update({
        where: {
          id: ticketId,
        },
        data: updateTicketTypeQuantitySold(value.ticketQuantity),
      });
    }
    console.log('Sending email to user', orderMap);
    await sendEmailConfirmationEmailToUser(order.id);
  } catch (error) {
    console.error('[Order] Error updating order:', error);
    throw error;
  }
}
