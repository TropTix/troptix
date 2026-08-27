/**
 * Only this service talks to Stripe. Deliberately no actor: a guest authorizes
 * by possession of the unguessable `reservationId` (ADR 0013).
 */
import { ReservationStatus } from '@troptix/db';
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import {
  HOLD_TTL_MINUTES,
  captureOrderCompleted,
  expireHold,
  settle,
} from './reservations';
import { NotFoundError } from './_shared/errors';
import type {
  BeginPaymentResponse,
  CheckoutState,
} from '../contracts/payments';
import type { CheckoutAnalytics } from '../contracts/analytics';

/**
 * Stripe truncates `PREFIX* SUFFIX` at 22 chars: TROPTIX (7) + `* ` (2) leaves
 * 13. Stripe rejects `<>\'"*` and non-Latin — strip; null if nothing survives.
 */
export function statementDescriptorSuffix(eventName: string): string | null {
  const cleaned = eventName
    .replace(/[<>\\'"*]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 13)
    .trim();
  return /[A-Z0-9]/.test(cleaned) ? cleaned : null;
}

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

  const [tiers, event] = await Promise.all([
    prisma.ticketTypes.findMany({
      where: { id: { in: reservation.items.map((i) => i.ticketTypeId) } },
      select: { id: true, name: true },
    }),
    prisma.events.findUnique({
      where: { id: reservation.eventId },
      select: { name: true },
    }),
  ]);
  const nameById = new Map(tiers.map((t) => [t.id, t.name]));
  const summary = {
    totalCents: reservation.totalCents,
    subtotalCents: reservation.subtotalCents,
    feesCents: reservation.feesCents,
    items: reservation.items.map((item) => ({
      name: nameById.get(item.ticketTypeId) ?? 'Ticket',
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      feesCents: item.feesCents,
    })),
  };

  // Committing to pay refreshes the hold to a fresh full TTL (ADR 0018), so
  // the server deadline stays ahead of the client countdown.
  const extendedExpiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60_000);

  let staleSessionId: string | null = null;
  if (reservation.stripeCheckoutSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(
      reservation.stripeCheckoutSessionId
    );
    if (existing.status === 'open' && existing.client_secret) {
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { expiresAt: extendedExpiresAt },
      });
      return {
        clientSecret: existing.client_secret,
        expiresAt: extendedExpiresAt.toISOString(),
        ...summary,
      };
    }
    // Non-open (expired / complete): mint a fresh Session — remember the dead
    // id so the create's key differs, else Stripe replays this dead Session.
    staleSessionId = reservation.stripeCheckoutSessionId;
  }

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

  const descriptorSuffix = event ? statementDescriptorSuffix(event.name) : null;

  const session = await stripe.checkout.sessions.create(
    {
      ui_mode: 'elements',
      mode: 'payment',
      line_items: lineItems,
      payment_method_types: ['card'],
      return_url: `${input.baseUrl}/e/${reservation.eventId}?reservation=${reservation.id}`,
      metadata: { reservationId: reservation.id, eventId: reservation.eventId },
      // Backstop for sessions the sweep never reaches (cron down). 2h clears
      // our longest hold-refresh, so a resume can't land on an auto-expired one.
      expires_at: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
      ...(descriptorSuffix
        ? {
            payment_intent_data: {
              statement_descriptor_suffix: descriptorSuffix,
            },
          }
        : {}),
      ...(reservation.email ? { customer_email: reservation.email } : {}),
    },
    {
      // Distinct-per-dead-session key on retry (stable for the same dead
      // Session, so concurrent retries still dedupe); the fixed key otherwise.
      idempotencyKey: staleSessionId
        ? `checkout-${reservation.id}-retry-${staleSessionId}`
        : `checkout-${reservation.id}`,
    }
  );

  if (!session.client_secret) {
    throw new Error(
      `Checkout Session ${session.id} returned no client_secret.`
    );
  }

  await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      stripeCheckoutSessionId: session.id,
      expiresAt: extendedExpiresAt,
    },
  });

  return {
    clientSecret: session.client_secret,
    expiresAt: extendedExpiresAt.toISOString(),
    ...summary,
  };
}

/**
 * Webhook and confirmation poll both converge on the idempotent `settle`; on
 * the expiry race the whole PaymentIntent is refunded (`refund-<id>` dedupes).
 */
export async function confirmPaid(
  prisma: PrismaClient,
  stripe: Stripe,
  input: {
    reservationId: string;
    paymentIntentId: string;
    cardType?: string | null;
    cardLast4?: string | null;
  },
  analytics?: CheckoutAnalytics
): Promise<CheckoutState> {
  const result = await settle(prisma, {
    reservationId: input.reservationId,
    paymentIntentId: input.paymentIntentId,
    cardType: input.cardType,
    cardLast4: input.cardLast4,
  });

  if (result.kind === 'converted') {
    // `alreadyProcessed` gates the capture to the first converter, so webhook
    // retries and racing polls can't double-count the conversion.
    if (!result.alreadyProcessed && analytics) {
      await captureOrderCompleted(
        prisma,
        analytics,
        input.reservationId,
        result.orderId
      );
    }
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
 * Not a pure read: a paid-but-unconverted Session is fulfilled inline (the
 * sync fallback to the webhook). One Stripe retrieve per call — never a loop.
 */
export async function getCheckoutState(
  prisma: PrismaClient,
  stripe: Stripe,
  input: { reservationId: string },
  analytics?: CheckoutAnalytics
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
  if (reservation.status === ReservationStatus.RELEASED) {
    return { kind: 'expired' };
  }

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
        return confirmPaid(
          prisma,
          stripe,
          { reservationId: reservation.id, paymentIntentId },
          analytics
        );
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

export interface SweepResult {
  released: number;
  /** Holds kept because their Session couldn't be expired (paid / transient). */
  keptLive: number;
}

/**
 * Expire the Stripe Session BEFORE releasing inventory (ADR 0018): Stripe only
 * expires an OPEN Session, so success proves it can never be paid; on failure
 * the hold stays put. Never "inventory released + a still-payable Session".
 */
export async function sweepExpiredHolds(
  prisma: PrismaClient,
  stripe: Stripe,
  now: Date = new Date()
): Promise<SweepResult> {
  const expired = await prisma.reservation.findMany({
    where: { status: ReservationStatus.HELD, expiresAt: { lt: now } },
    select: { id: true, stripeCheckoutSessionId: true },
  });

  let released = 0;
  let keptLive = 0;
  for (const reservation of expired) {
    if (reservation.stripeCheckoutSessionId) {
      try {
        await stripe.checkout.sessions.expire(
          reservation.stripeCheckoutSessionId
        );
      } catch {
        // Already paid/complete (can't expire) or a transient error — keep the
        // hold; conversion or a later sweep resolves it. Never release here.
        keptLive++;
        continue;
      }
    }
    if (await expireHold(prisma, reservation.id)) released++;
  }
  return { released, keptLive };
}
