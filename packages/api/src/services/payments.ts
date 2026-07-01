/**
 * Paid-checkout orchestration over the Checkout Sessions API (ADR 0018).
 *
 * This is the only service that talks to Stripe; the reservation/inventory
 * primitives (`services/reservations.ts`) stay Stripe-free. The Stripe client is
 * injected (never imported) so these stay framework-agnostic and testable with a
 * fake Stripe. Authorization is the caller's job — a guest authorizes by
 * possession of the unguessable `reservationId` (ADR 0013).
 */
import { ReservationStatus } from '@troptix/db';
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import { settle } from './reservations';
import { NotFoundError } from './_shared/errors';
import type {
  BeginPaymentResponse,
  CheckoutState,
} from '../contracts/payments';

async function orderCheckoutState(
  prisma: PrismaClient,
  orderId: string
): Promise<CheckoutState> {
  const tickets = await prisma.tickets.findMany({
    where: { orderId },
    select: { id: true, ticketType: { select: { name: true } } },
  });
  return {
    kind: 'order',
    orderId,
    tickets: tickets.map((t) => ({
      id: t.id,
      ticketTypeName: t.ticketType?.name ?? null,
    })),
  };
}

/**
 * Create (or reuse) the Checkout Session for a held paid reservation and return
 * its client secret. Idempotent: an existing open Session is reused, and the
 * `checkout-<reservationId>` idempotency key means a racing create returns the
 * same Session. Line items are derived from the reservation's server-computed
 * amounts (a line per tier + a single "Service fee" line), so Stripe charges
 * exactly our authoritative total.
 */
export async function beginPayment(
  prisma: PrismaClient,
  stripe: Stripe,
  input: { reservationId: string; baseUrl: string }
): Promise<BeginPaymentResponse> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    include: { items: true },
  });

  if (!reservation) {
    throw new NotFoundError(`Reservation ${input.reservationId} not found.`);
  }
  if (reservation.status !== ReservationStatus.HELD) {
    throw new Error(
      `Reservation ${reservation.id} is ${reservation.status}; cannot start payment.`
    );
  }
  if (reservation.expiresAt.getTime() <= Date.now()) {
    throw new Error(`Reservation ${reservation.id} has expired.`);
  }
  if (reservation.totalCents <= 0) {
    throw new Error(
      `Reservation ${reservation.id} is free; use the free RSVP flow.`
    );
  }

  // Reuse an existing open Session (refresh / resume / racing call).
  if (reservation.stripeCheckoutSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(
      reservation.stripeCheckoutSessionId
    );
    if (existing.status === 'open' && existing.client_secret) {
      return {
        clientSecret: existing.client_secret,
        expiresAt: reservation.expiresAt.toISOString(),
        totalCents: reservation.totalCents,
      };
    }
  }

  const tiers = await prisma.ticketTypes.findMany({
    where: { id: { in: reservation.items.map((i) => i.ticketTypeId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(tiers.map((t) => [t.id, t.name]));

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
    reservation.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: 'usd',
        unit_amount: item.unitPriceCents,
        product_data: { name: nameById.get(item.ticketTypeId) ?? 'Ticket' },
      },
    }));
  if (reservation.feesCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: reservation.feesCents,
        product_data: { name: 'Service fee' },
      },
    });
  }

  const session = await stripe.checkout.sessions.create(
    {
      ui_mode: 'elements',
      mode: 'payment',
      line_items: lineItems,
      payment_method_types: ['card'],
      return_url: `${input.baseUrl}/e/${reservation.eventId}?reservation=${reservation.id}`,
      metadata: { reservationId: reservation.id, eventId: reservation.eventId },
      ...(reservation.email ? { customer_email: reservation.email } : {}),
    },
    { idempotencyKey: `checkout-${reservation.id}` }
  );

  if (!session.client_secret) {
    throw new Error(
      `Checkout Session ${session.id} returned no client_secret.`
    );
  }

  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return {
    clientSecret: session.client_secret,
    expiresAt: reservation.expiresAt.toISOString(),
    totalCents: reservation.totalCents,
  };
}

/**
 * Fulfill a paid reservation and return its buyer-visible state. Shared by the
 * webhook (canonical) and the confirmation poll (sync fallback) — both converge
 * on the idempotent `settle`. On the expiry race (`needs_refund`), refund the
 * whole PaymentIntent and mark the reservation REFUNDED. Idempotent under
 * at-least-once webhooks + concurrent polls: `settle` guards on status and the
 * `refund-<reservationId>` idempotency key prevents a double refund.
 */
export async function confirmPaid(
  prisma: PrismaClient,
  stripe: Stripe,
  input: {
    reservationId: string;
    paymentIntentId: string;
    cardType?: string | null;
    cardLast4?: string | null;
  }
): Promise<CheckoutState> {
  const result = await settle(prisma, {
    reservationId: input.reservationId,
    paymentIntentId: input.paymentIntentId,
    cardType: input.cardType,
    cardLast4: input.cardLast4,
  });

  if (result.kind === 'converted') {
    return orderCheckoutState(prisma, result.orderId);
  }
  if (result.kind === 'already_refunded') {
    return { kind: 'refunded' };
  }

  const refund = await stripe.refunds.create(
    { payment_intent: input.paymentIntentId },
    { idempotencyKey: `refund-${input.reservationId}` }
  );
  await prisma.reservation.update({
    where: { id: input.reservationId },
    data: { status: ReservationStatus.REFUNDED, stripeRefundId: refund.id },
  });
  return { kind: 'refunded' };
}

/**
 * The buyer-visible state of a checkout — powers both the confirmation poll and
 * resume-from-URL after the payment redirect. If the reservation isn't yet an
 * order but its Session has been paid, fulfill inline (the hybrid-fulfillment
 * sync fallback, per Stripe's fulfillment guide) so tickets appear even when the
 * webhook is slow or down. Never polls Stripe on a loop — one retrieve per call.
 */
export async function getCheckoutState(
  prisma: PrismaClient,
  stripe: Stripe,
  input: { reservationId: string }
): Promise<CheckoutState> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    select: {
      id: true,
      status: true,
      orderId: true,
      totalCents: true,
      expiresAt: true,
      stripeCheckoutSessionId: true,
    },
  });

  if (!reservation) {
    throw new NotFoundError(`Reservation ${input.reservationId} not found.`);
  }

  if (reservation.status === ReservationStatus.CONVERTED) {
    if (!reservation.orderId) {
      throw new Error(
        `Reservation ${reservation.id} is CONVERTED but has no orderId`
      );
    }
    return orderCheckoutState(prisma, reservation.orderId);
  }
  if (reservation.status === ReservationStatus.REFUNDED) {
    return { kind: 'refunded' };
  }
  // RELEASED (buyer abandoned) reads as expired to the UI.
  if (reservation.status === ReservationStatus.RELEASED) {
    return { kind: 'expired' };
  }

  // HELD or EXPIRED: if the Session has been paid, fulfill now (sync fallback).
  if (reservation.stripeCheckoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(
      reservation.stripeCheckoutSessionId
    );
    if (session.payment_status !== 'unpaid') {
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      if (paymentIntentId) {
        return confirmPaid(prisma, stripe, {
          reservationId: reservation.id,
          paymentIntentId,
        });
      }
    }
  }

  if (
    reservation.status === ReservationStatus.HELD &&
    reservation.expiresAt.getTime() > Date.now()
  ) {
    return {
      kind: 'held',
      expiresAt: reservation.expiresAt.toISOString(),
      totalCents: reservation.totalCents,
    };
  }
  return { kind: 'expired' };
}
