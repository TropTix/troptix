import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { confirmPaid } from '@troptix/api/server';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';
import { serverAnalytics } from '@/server/lib/analytics';
import {
  sendEmailConfirmationEmailToUser,
  sendRefundNoticeEmail,
} from '@/server/lib/email';

/**
 * Fulfiller for the `/e/` reservation flow (ADR 0018) — separate endpoint and
 * signing secret from the legacy `pages/api/stripe/webhook.ts`.
 */
export const runtime = 'nodejs';

const endpointSecret = process.env.STRIPE_RESERVATION_WEBHOOK_SECRET;

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig || !endpointSecret) {
    return NextResponse.json(
      { error: 'Missing signature or endpoint secret' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    console.error('[ReservationWebhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const seen = await prisma.processedStripeEvent.findUnique({
    where: { id: event.id },
    select: { id: true },
  });
  if (seen) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    // 500 → Stripe retries. Fulfillment is idempotent, so a retry is safe.
    console.error(
      `[ReservationWebhook] Handler error for ${event.type} (${event.id}):`,
      err
    );
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  // Record only after successful handling; a concurrent delivery may have
  // recorded it first (unique id) — that's fine.
  try {
    await prisma.processedStripeEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch {
    // Already recorded by a racing delivery.
  }
  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const reservationId = session.metadata?.reservationId;
      if (!reservationId) {
        // Not one of ours — acknowledge without acting.
        return;
      }
      if (session.payment_status === 'unpaid') {
        // A completed-but-unpaid Session has nothing to fulfill.
        return;
      }
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      if (!paymentIntentId) {
        console.error(
          `[ReservationWebhook] Session ${session.id} completed with no payment_intent`
        );
        return;
      }

      const state = await confirmPaid(
        prisma,
        stripe,
        { reservationId, paymentIntentId },
        serverAnalytics()
      );
      if (state.kind === 'order') {
        // Resend dedupes on `confirmation-${orderId}`, so this is safe to send
        // here even though the client may also fire it on the success screen.
        try {
          await sendEmailConfirmationEmailToUser(state.orderId);
        } catch (emailErr) {
          console.error(
            '[ReservationWebhook] Confirmation email failed (non-fatal):',
            emailErr
          );
        }
      } else if (state.kind === 'refunded') {
        await sendRefundNoticeEmail(reservationId);
      }
      return;
    }

    case 'checkout.session.expired':
      // The sweep expires Sessions itself and releases inventory in the same
      // pass (cancel-then-release), so this is just an acknowledgement.
      return;

    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed': {
      // v1 is cards-only, so delayed-settlement events shouldn't fire. Log if
      // they ever do (e.g. a payment method was enabled in the dashboard).
      const session = event.data.object as Stripe.Checkout.Session;
      console.warn(
        `[ReservationWebhook] Unexpected async payment event ${event.type} for Session ${session.id}`
      );
      return;
    }

    default:
      return;
  }
}
