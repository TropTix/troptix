import prisma from '@/server/prisma';
import { Prisma } from '@troptix/db';
import {
  buildOrderConfirmation,
  type EmailAttachment,
} from '@troptix/transactional';
import { getAppBaseUrl } from '@/lib/appUrl';
import { eventFlyerUrl } from '@/lib/supabase/storage';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Hybrid fulfillment sends the same email from two places (the Stripe webhook
 * and the client success/poll), so two requests can hit Resend with the same
 * idempotency key concurrently. Resend 409s the loser with
 * `concurrent_idempotent_requests` while the winner sends it — benign, not a
 * failure (Resend docs: "safe to retry later"). Treat it as success.
 */
function isConcurrentIdempotencyConflict(error: { name?: string } | null) {
  return error?.name === 'concurrent_idempotent_requests';
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  orderId: string,
  attachments: EmailAttachment[] = []
) {
  const { data, error } = await resend.emails.send(
    {
      from: 'TropTix <info@usetroptix.com>',
      to,
      subject,
      html,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        content: Buffer.from(attachment.content, 'utf-8'),
        contentType: attachment.contentType,
      })),
    },
    { idempotencyKey: `confirmation-${orderId}` }
  );
  // Resend reports failures via `error`, not by throwing.
  if (error) {
    if (isConcurrentIdempotencyConflict(error)) {
      console.log(
        `Confirmation email for ${orderId} already in progress (idempotent) — skipping duplicate.`
      );
      return null;
    }
    throw new Error(`Resend failed to send email: ${error.message}`);
  }
  console.log('Email sent successfully:', data);
  return data;
}

// Only passing the orderID since this will eventually be called from a seperate email worker and we only will be passing the orderID
export async function sendEmailConfirmationEmailToUser(orderId: string) {
  const orderDetails = await getOrderDetails(orderId);
  if (!orderDetails) {
    console.error('Order not found');
    return;
  }
  if (!orderDetails.email) {
    console.error('Order email not found');
    return;
  }

  // imageUrl now stores a Supabase bucket PATH (ADR 0016), and email clients
  // can't resolve a relative src — resolve it to an absolute URL before render.
  const order = {
    ...orderDetails,
    event: {
      ...orderDetails.event,
      imageUrl: eventFlyerUrl(orderDetails.event.imageUrl),
    },
  };
  const { subject, html, attachments } = await buildOrderConfirmation(order, {
    baseUrl: getAppBaseUrl(),
  });

  // Throws on a real transport failure. The outbox drainer owns the retry/attempt
  // bookkeeping; the (soon-to-be-deleted) legacy Stripe webhook wraps its own call
  // so an email failure can't 500 the webhook into re-processing a complete order.
  await sendEmail(orderDetails.email, subject, html, orderId, attachments);
}

/**
 * Notify a buyer that their payment was auto-refunded because the tickets sold
 * out while it was processing (the expiry race, ADR 0018). Minimal inline HTML —
 * there's no order to render. Deduped by `refund-<reservationId>` so a retried
 * send never double-emails. Throws on a real transport failure so the outbox
 * drainer can retry it.
 */
export async function sendRefundNoticeEmail(reservationId: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      email: true,
      firstName: true,
      totalCents: true,
      event: { select: { name: true } },
    },
  });
  if (!reservation?.email) {
    console.error(`[Refund] No email for reservation ${reservationId}`);
    return;
  }

  const eventName = reservation.event?.name ?? 'the event';
  const amount = `$${(reservation.totalCents / 100).toFixed(2)}`;
  const html = `
    <p>Hi ${reservation.firstName ?? 'there'},</p>
    <p>Unfortunately, tickets to <strong>${eventName}</strong> sold out while
    your payment was processing, so we&rsquo;ve refunded your ${amount} in full.</p>
    <p>The refund may take a few days to appear on your statement. You were not
    charged for any tickets.</p>
    <p>— TropTix</p>`;

  const { error } = await resend.emails.send(
    {
      from: 'TropTix <info@usetroptix.com>',
      to: reservation.email,
      subject: `Your ${eventName} payment was refunded`,
      html,
    },
    { idempotencyKey: `refund-${reservationId}` }
  );
  if (error && !isConcurrentIdempotencyConflict(error)) {
    throw new Error(`Resend failed to send refund notice: ${error.message}`);
  }
}

async function getOrderDetails(orderId: string) {
  return await prisma.orders.findUnique({
    where: {
      id: orderId,
    },
    select: OrderDetailsSelect,
  });
}

const OrderDetailsSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  total: true,
  subtotal: true,
  fees: true,
  createdAt: true,
  cardLast4: true,
  tickets: {
    select: {
      id: true,
      total: true,
      subtotal: true,
      fees: true,
      ticketType: {
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
        },
      },
    },
  },
  event: {
    select: {
      id: true,
      name: true,
      imageUrl: true,
      startDate: true,
      endDate: true,
      address: true,
      description: true,
    },
  },
} satisfies Prisma.OrdersSelect;
