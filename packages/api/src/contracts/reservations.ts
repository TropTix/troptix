import { z } from 'zod';

// Reservation/checkout-commit contracts. Cents + ISO strings on the wire (no
// superjson transformer), shared by the tRPC procedures and the client.

export const reservationContactSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
  email: z.string().trim().email('Enter a valid email.'),
});
export type ReservationContact = z.infer<typeof reservationContactSchema>;

export const createReservationInputSchema = z.object({
  eventId: z.string().min(1),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1),
        quantity: z.number().int().min(1),
      })
    )
    .min(1),
  contact: reservationContactSchema,
});
export type CreateReservationInput = z.infer<
  typeof createReservationInputSchema
>;

export const createReservationResponseSchema = z.object({
  reservationId: z.string(),
  items: z.array(
    z.object({
      ticketTypeId: z.string(),
      requested: z.number().int(),
      granted: z.number().int(),
    })
  ),
  totalCents: z.number().int(),
  /** ISO-8601 — the hold's TTL. */
  expiresAt: z.string().datetime(),
  /** True if any granted quantity fell short of what was requested. */
  wasAdjusted: z.boolean(),
});
export type CreateReservationResponse = z.infer<
  typeof createReservationResponseSchema
>;

export const completeFreeInputSchema = z.object({
  reservationId: z.string().min(1),
});
export type CompleteFreeInput = z.infer<typeof completeFreeInputSchema>;

export const releaseInputSchema = z.object({
  reservationId: z.string().min(1),
});
export type ReleaseInput = z.infer<typeof releaseInputSchema>;

export const completeFreeResponseSchema = z.object({
  orderId: z.string(),
  /** Guest ticket-access token for the confirmation link (`?t=`). */
  accessToken: z.string().nullable(),
  tickets: z.array(
    z.object({ id: z.string(), ticketTypeName: z.string().nullable() })
  ),
});
export type CompleteFreeResponse = z.infer<typeof completeFreeResponseSchema>;
