import { z } from 'zod';

// No superjson transformer on the wire — ISO strings, never z.date().

export const beginPaymentInputSchema = z.object({
  reservationId: z.string().min(1),
});
export type BeginPaymentInput = z.infer<typeof beginPaymentInputSchema>;

export const paymentSummaryItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  feesCents: z.number().int(),
});
export type PaymentSummaryItem = z.infer<typeof paymentSummaryItemSchema>;

export const beginPaymentResponseSchema = z.object({
  clientSecret: z.string(),
  expiresAt: z.string().datetime(),
  totalCents: z.number().int(),
  subtotalCents: z.number().int(),
  feesCents: z.number().int(),
  /** From the reservation, not the client — it must survive a resumed/refreshed
   * payment screen where the client selection is gone. */
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

export const checkoutStateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('held'),
    expiresAt: z.string().datetime(),
    totalCents: z.number().int(),
  }),
  z.object({
    kind: z.literal('order'),
    orderId: z.string(),
    tickets: z.array(checkoutOrderTicketSchema),
  }),
  z.object({ kind: z.literal('expired') }),
  z.object({ kind: z.literal('refunded') }),
]);
export type CheckoutState = z.infer<typeof checkoutStateSchema>;
