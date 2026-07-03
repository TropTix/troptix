import { z } from 'zod';

// Paid-checkout contracts (ADR 0018). Cents + ISO strings on the wire (no
// superjson transformer), shared by the tRPC procedures and the client.

export const beginPaymentInputSchema = z.object({
  reservationId: z.string().min(1),
});
export type BeginPaymentInput = z.infer<typeof beginPaymentInputSchema>;

/** One order-summary line for the payment screen (server-authoritative). */
export const paymentSummaryItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  feesCents: z.number().int(),
});
export type PaymentSummaryItem = z.infer<typeof paymentSummaryItemSchema>;

export const beginPaymentResponseSchema = z.object({
  /** Checkout Session client secret for `CheckoutElementsProvider`. */
  clientSecret: z.string(),
  /** ISO-8601 — the hold's TTL (drives the countdown). */
  expiresAt: z.string().datetime(),
  totalCents: z.number().int(),
  subtotalCents: z.number().int(),
  feesCents: z.number().int(),
  /** What the buyer is paying for — from the reservation, so it survives a
   * resumed/refreshed payment screen where the client selection is gone. */
  items: z.array(paymentSummaryItemSchema),
});
export type BeginPaymentResponse = z.infer<typeof beginPaymentResponseSchema>;

export const getCheckoutStateInputSchema = z.object({
  reservationId: z.string().min(1),
});
export type GetCheckoutStateInput = z.infer<typeof getCheckoutStateInputSchema>;

const checkoutOrderTicketSchema = z.object({
  id: z.string(),
  ticketTypeName: z.string().nullable(),
});

/**
 * The buyer-visible state of a reservation-backed checkout — the single shape
 * behind both the confirmation poll and resume-from-URL. `held` means still
 * payable; `order` means fulfilled; `expired` and `refunded` are terminal
 * exception states each rendered with its own explicit copy.
 */
export const checkoutStateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('held'),
    expiresAt: z.string().datetime(),
    totalCents: z.number().int(),
  }),
  z.object({
    kind: z.literal('order'),
    orderId: z.string(),
    /** Guest ticket-access token for the confirmation link (`?t=`). */
    accessToken: z.string().nullable(),
    tickets: z.array(checkoutOrderTicketSchema),
  }),
  z.object({ kind: z.literal('expired') }),
  z.object({ kind: z.literal('refunded') }),
]);
export type CheckoutState = z.infer<typeof checkoutStateSchema>;
