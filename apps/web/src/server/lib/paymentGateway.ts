import type { PaymentGateway } from '@troptix/api/server';
import { stripe } from './stripe';

/**
 * Stripe-backed implementation of @troptix/api's `PaymentGateway` port
 * (Stage 3 plan). The reservation id doubles as the Stripe idempotency key —
 * a client retry of `checkout.initiate` for the same hold can't mint a second
 * PaymentIntent — and rides in metadata, which is how the webhook finds the
 * reservation to `confirm`.
 *
 * Customer find-or-create is deliberately not done here yet (guest checkout
 * has no customer); revisit at the 3c cutover if receipts/saved cards need it.
 */
export const stripePaymentGateway: PaymentGateway = {
  async createPaymentIntent(input) {
    const intent = await stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        receipt_email: input.email ?? undefined,
        description: input.description,
        metadata: {
          reservationId: input.reservationId,
          eventId: input.eventId,
          ...(input.userId ? { userId: input.userId } : {}),
        },
      },
      { idempotencyKey: input.reservationId }
    );

    if (!intent.client_secret) {
      throw new Error(
        `PaymentIntent ${intent.id} was created without a client secret`
      );
    }
    return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
  },
};
