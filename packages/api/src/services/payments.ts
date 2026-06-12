/**
 * Payment gateway port (Stage 3 plan). The `initiateCheckout` orchestration
 * needs to mint a PaymentIntent, but Stripe must not leak into this package —
 * services stay pure and unit-testable (ADR 0009/0013). The port is the seam:
 * `apps/web` injects an implementation over its shared Stripe client; tests
 * inject a fake.
 *
 * Deliberately one method. Customer find-or-create, receipts, and saved cards
 * are adapter concerns (and guest checkout has no customer at all) — they live
 * behind the implementation, not in the port.
 */
export interface CreatePaymentIntentInput {
  /** Charge amount in integer cents (the reservation's `totalCents`). */
  amountCents: number;
  /**
   * The reservation being paid for. Implementations MUST use this as the
   * Stripe idempotency key (client retries of initiate can't double-create
   * PaymentIntents) and stamp it in metadata (the webhook confirms by it).
   */
  reservationId: string;
  eventId: string;
  /** Buyer contact for the receipt; null for guests who gave none. */
  email?: string | null;
  /** Stable app user id (`Users.id`) when the buyer is signed in. */
  userId?: string | null;
  /** Human-readable statement/dashboard description (e.g. the event name). */
  description?: string;
}

export interface CreatePaymentIntentResult {
  paymentIntentId: string;
  clientSecret: string;
}

export interface PaymentGateway {
  createPaymentIntent(
    input: CreatePaymentIntentInput
  ): Promise<CreatePaymentIntentResult>;
}
