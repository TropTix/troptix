import prisma from '@/server/prisma';
import { Prisma } from '@/generated/prisma/client';
import { createElement } from 'react';
import { render } from '@react-email/components';
import EmailConfirmationTemplate from '@emails/EmailConfirmation';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  orderId: string
) {
  try {
    const { data, error } = await resend.emails.send(
      {
        from: 'TropTix <info@usetroptix.com>',
        to,
        subject,
        html,
      },
      { idempotencyKey: `confirmation-${orderId}` }
    );
    console.log('Email sent successfully:', data);
    if (error) {
      console.error('Error sending email:', error);
    }
    return data;
  } catch (error) {
    console.error('Error sending email:', error);
    return error;
  }
}

// Only passing the orderID since this will eventually be called from a seperate email worker and we only will be passing the orderID
export async function sendEmailConfirmationEmailToUser(orderId: string) {
  const orderDetails = await getOrderDetails(orderId);
  if (!orderDetails) {
    console.error('Order not found');
    return;
  }
  const html = await createEmailConfirmationEmailHTML(orderDetails);
  if (!orderDetails.email) {
    console.error('Order email not found');
    return;
  }
  await sendEmail(
    orderDetails.email,
    `Order Confirmation for ${orderDetails.event.name}`,
    html,
    orderId
  );
}

async function createEmailConfirmationEmailHTML(orderDetails: OrderDetails) {
  const html = await render(
    createElement(EmailConfirmationTemplate, {
      order: orderDetails,
    })
  );
  return html;
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

type OrderDetails = Prisma.OrdersGetPayload<{
  select: typeof OrderDetailsSelect;
}>;
