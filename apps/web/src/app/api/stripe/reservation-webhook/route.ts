import { NextResponse, after } from 'next/server';
import type Stripe from 'stripe';
import { confirmPaid } from '@troptix/api/server';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';
import { drainOutbox } from '@/server/lib/outbox';

/**
 * Reservation checkout webhook (ADR 0018) — the canonical fulfiller for the new
 * `/e/` paid flow. Separate endpoint + signing secret from the legacy
 * `pages/api/stripe/webhook.ts`, so the two flows never interfere.
 *
 * `checkout.session.completed` → `confirmPaid` (idempotent; auto-refunds on the
 * expiry race). We only act on Sessions carrying `metadata.reservationId`, and
 * dedupe by event id — both belt-and-suspenders on top of `settle`'s own
 * idempotency. `confirmPaid` enqueues the email in-txn; we drain it via
 * `after()` (post-response, no dangling promise), with the cron as backstop.
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

  // At-least-once delivery: skip an event we've already fully handled.
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

      await confirmPaid(prisma, stripe, {
        reservationId,
        paymentIntentId,
      });
      after(() =>
        drainOutbox().catch((err) =>
          console.error('[ReservationWebhook] Outbox drain failed:', err)
        )
      );
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
      // Not subscribed / unexpected — acknowledge so Stripe stops retrying.
      return;
  }
}
