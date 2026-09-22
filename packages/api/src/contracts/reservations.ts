import { z } from 'zod';

// No superjson transformer on the wire — ISO strings, never z.date().

export const reservationContactSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
  // Stored lowercase so an order matches the signed-in user's address, which the
  // provisioning trigger always lowercases.
  email: z
    .string()
    .trim()
    .email('Enter a valid email.')
    .transform((value) => value.toLowerCase()),
});
export type ReservationContact = z.infer<typeof reservationContactSchema>;

export const createReservationInputSchema = z.object({
  eventId: z.string().min(1),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
      })
    )
    .min(1)
    .max(20),
  contact: reservationContactSchema,
  // PostHog browser identity, stored on the hold so the server-side conversion
  // capture joins the buyer's person/session.
  analytics: z
    .object({
      distinctId: z.string().min(1).max(200).optional(),
      sessionId: z.string().min(1).max(200).optional(),
    })
    .optional(),
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
  expiresAt: z.string().datetime(),
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
  tickets: z.array(
    z.object({ id: z.string(), ticketTypeName: z.string().nullable() })
  ),
});
export type CompleteFreeResponse = z.infer<typeof completeFreeResponseSchema>;
