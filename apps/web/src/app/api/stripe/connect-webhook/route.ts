import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { handleConnectEvent } from '@troptix/api/server';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';

/**
 * Thin-event destination for the organizer Stripe accounts (ADR 0030) — its
 * own signing secret, separate from the reservation webhook's snapshot events.
 */
export const runtime = 'nodejs';

const endpointSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig || !endpointSecret) {
    return NextResponse.json(
      { error: 'Missing signature or endpoint secret' },
      { status: 400 }
    );
  }

  let notification: Stripe.V2.Core.EventNotification;
  try {
    notification = stripe.parseEventNotification(body, sig, endpointSecret);
  } catch (err) {
    console.error('[ConnectWebhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const seen = await prisma.processedStripeEvent.findUnique({
    where: { id: notification.id },
    select: { id: true },
  });
  if (seen) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const outcome = await handleConnectEvent(prisma, notification);
    console.log(
      `[ConnectWebhook] ${notification.type} (${notification.id}): ${outcome}`
    );
  } catch (err) {
    // 500 → Stripe retries. The stamp is idempotent, so a retry is safe.
    console.error(
      `[ConnectWebhook] Handler error for ${notification.type} (${notification.id}):`,
      err
    );
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  try {
    await prisma.processedStripeEvent.create({
      data: { id: notification.id, type: notification.type },
    });
  } catch {
    // Already recorded by a racing delivery.
  }
  return NextResponse.json({ received: true });
}
