import prisma from '@/server/prisma';
import { dispatchEmails, EMAIL_TYPES } from '@troptix/api/server';
import type { EmailSender, SendOutcome } from '@troptix/api/server';
import { Prisma } from '@troptix/db';
import type { Email } from '@troptix/db';
import {
  buildDisputeNotice,
  buildOrderConfirmation,
  buildRefundNotice,
} from '@troptix/transactional';
import { getAppBaseUrl } from '@/lib/appUrl';
import { formatCents } from '@/lib/dateUtils';
import { eventFlyerUrl } from '@/lib/supabase/storage';
import { stripe } from '@/server/lib/stripe';
import { captureEmailFailed } from '@/server/lib/analytics';
import { Resend, type ErrorResponse } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

function outcomeOf(error: ErrorResponse): SendOutcome {
  switch (error.name) {
    case 'rate_limit_exceeded':
      return { ok: false, reason: 'rate_limited', message: error.message };
    case 'daily_quota_exceeded':
      return { ok: false, reason: 'daily_quota', message: error.message };
    case 'monthly_quota_exceeded':
      return { ok: false, reason: 'monthly_quota', message: error.message };
    case 'concurrent_idempotent_requests':
      return { ok: false, reason: 'in_progress', message: error.message };
    default:
      return { ok: false, reason: 'error', message: error.message };
  }
}

async function buildOrderConfirmationEmail(orderId: string) {
  const orderDetails = await getOrderDetails(orderId);
  if (!orderDetails) throw new Error(`Order ${orderId} not found`);

  // imageUrl now stores a Supabase bucket PATH (ADR 0016), and email clients
  // can't resolve a relative src — resolve it to an absolute URL before render.
  const order = {
    ...orderDetails,
    event: {
      ...orderDetails.event,
      imageUrl: eventFlyerUrl(orderDetails.event.imageUrl),
    },
  };
  return buildOrderConfirmation(order, { baseUrl: getAppBaseUrl() });
}

async function buildRefundNoticeEmail(reservationId: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      firstName: true,
      totalCents: true,
      event: { select: { name: true } },
    },
  });
  if (!reservation) throw new Error(`Reservation ${reservationId} not found`);
  return buildRefundNotice({
    firstName: reservation.firstName,
    eventName: reservation.event?.name ?? 'the event',
    amount: formatCents(reservation.totalCents),
  });
}

/**
 * A chargeback after a payout is the one case Stripe's marketplace guidance
 * says to act on the same day (reverse the transfer). Nothing automatic here:
 * the notice tells a Platform Owner; the runbook carries the steps.
 */
async function buildDisputeNoticeEmail(disputeId: string) {
  const dispute = await stripe.disputes.retrieve(disputeId);
  const charge =
    typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
  return buildDisputeNotice({
    id: dispute.id,
    amount:
      dispute.currency === 'usd'
        ? formatCents(dispute.amount)
        : `${dispute.amount} ${dispute.currency.toUpperCase()} (minor units)`,
    reason: dispute.reason,
    charge,
  });
}

async function buildEmail(email: Email) {
  switch (email.type) {
    case EMAIL_TYPES.orderConfirmation:
      return buildOrderConfirmationEmail(email.subjectId);
    case EMAIL_TYPES.refundNotice:
      return buildRefundNoticeEmail(email.subjectId);
    case EMAIL_TYPES.disputeNotice:
      return buildDisputeNoticeEmail(email.subjectId);
    default:
      throw new Error(`No builder for email type ${email.type}`);
  }
}

const sendEmail: EmailSender = async (email) => {
  const { subject, html, attachments } = await buildEmail(email);
  const { data, error } = await resend.emails.send(
    {
      from: 'TropTix <info@usetroptix.com>',
      to: email.to,
      subject,
      html,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        content: Buffer.from(attachment.content, 'utf-8'),
        contentType: attachment.contentType,
      })),
      tags: [{ name: 'email_id', value: email.id }],
    },
    { idempotencyKey: email.idempotencyKey }
  );
  if (error) return outcomeOf(error);
  return { ok: true, resendId: data.id };
};

export async function dispatchDueEmails(): Promise<void> {
  const result = await dispatchEmails(prisma, sendEmail);
  await Promise.all(
    result.failed.map((email) => {
      console.error(
        `[Email] Gave up on ${email.type} ${email.id} after ${email.attempts} attempts:`,
        email.lastError
      );
      return captureEmailFailed({
        emailId: email.id,
        type: email.type,
        status: email.status,
        error: email.lastError,
      });
    })
  );
  if (result.quotaExceeded) {
    console.error(
      `[Email] Resend ${result.quotaExceeded} exceeded; sending paused.`
    );
    await captureEmailFailed({ status: result.quotaExceeded });
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
      startsAt: true,
      endsAt: true,
      address: true,
      description: true,
    },
  },
} satisfies Prisma.OrdersSelect;
