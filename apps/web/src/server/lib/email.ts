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

  // A failed confirmation email must never break the order — the Stripe webhook
  // re-throws, and Stripe would retry and re-process an already-complete order.
  try {
    await sendEmail(orderDetails.email, subject, html, orderId, attachments);
  } catch (error) {
    console.error('Failed to send order confirmation email:', error);
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
