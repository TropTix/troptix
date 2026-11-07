import prisma from '@/server/prisma';
import { dispatchEmails, EMAIL_TYPES } from '@troptix/api/server';
import type { EmailSender, SendOutcome } from '@troptix/api/server';
import { Prisma } from '@troptix/db';
import type { Email } from '@troptix/db';
import { buildOrderConfirmation } from '@troptix/transactional';
import { getAppBaseUrl } from '@/lib/appUrl';
import { formatCents } from '@/lib/dateUtils';
import { eventFlyerUrl } from '@/lib/supabase/storage';
import { Resend, type ErrorResponse } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * The webhook and the checkout screen can both send the same notice; Resend
 * 409s the loser while the winner sends it — benign, treat as success.
 */
function isConcurrentIdempotencyConflict(error: { name?: string } | null) {
  return error?.name === 'concurrent_idempotent_requests';
}

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

async function buildEmail(email: Email) {
  switch (email.type) {
    case EMAIL_TYPES.orderConfirmation:
      return buildOrderConfirmationEmail(email.subjectId);
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
  for (const email of result.failed) {
    console.error(
      `[Email] Gave up on ${email.type} ${email.id} after ${email.attempts} attempts:`,
      email.lastError
    );
  }
  if (result.quotaExceeded) {
    console.error(
      `[Email] Resend ${result.quotaExceeded} exceeded; sending paused.`
    );
  }
}

/**
 * Deduped by `refund-<reservationId>` so a retried webhook never double-sends;
 * never throws (fired from the webhook). Expiry race: ADR 0018.
 */
export async function sendRefundNoticeEmail(reservationId: string) {
  try {
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
      console.error('[Refund] Resend failed to send refund notice:', error);
    }
  } catch (error) {
    console.error('[Refund] Failed to send refund notice email:', error);
  }
}

/**
 * A chargeback after a payout is the one case Stripe's marketplace guidance
 * says to act on the same day (reverse the transfer). Nothing automatic here:
 * the notice tells a Platform Owner; the runbook carries the steps.
 */
export async function sendDisputeNoticeEmail(dispute: {
  id: string;
  amount: number;
  currency: string;
  reason: string;
  charge: string;
}) {
  const amount =
    dispute.currency === 'usd'
      ? formatCents(dispute.amount)
      : `${dispute.amount} ${dispute.currency.toUpperCase()} (minor units)`;
  const html = `
    <p>A buyer disputed a charge: <strong>${amount}</strong>, reason <code>${dispute.reason}</code>.</p>
    <p>Dispute <a href="https://dashboard.stripe.com/payments/${dispute.charge}">${dispute.id}</a> on charge <code>${dispute.charge}</code>.</p>
    <p>If the organizer has already been paid for this event, reverse that
    transfer today. Steps are in docs/runbooks/stripe-connect.md.</p>`;

  try {
    const { error } = await resend.emails.send(
      {
        from: 'TropTix <info@usetroptix.com>',
        to: 'info@usetroptix.com',
        subject: `Chargeback opened: ${amount} (${dispute.id})`,
        html,
      },
      { idempotencyKey: `dispute-${dispute.id}` }
    );
    if (error && !isConcurrentIdempotencyConflict(error)) {
      console.error('[Dispute] Resend failed to send dispute notice:', error);
    }
  } catch (error) {
    console.error('[Dispute] Failed to send dispute notice email:', error);
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
