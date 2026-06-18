import { z } from 'zod';

// --- EventDetail --------------------------------------------------------------
// The public event-page DTO: event meta + a server-computed "From $X" price.
// Client-safe by construction — no ticket rows, no discount codes, no gated-tier
// data ever reaches the browser; the cheapest public price is pre-derived here.

export const eventDetailInputSchema = z.object({
  eventId: z.string().min(1),
});
export type EventDetailInput = z.infer<typeof eventDetailInputSchema>;

export const eventDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  summary: z.string().nullable(),
  /** Stored flyer path (resolved to an absolute URL by the web layer). */
  imageUrl: z.string().nullable(),
  isDraft: z.boolean(),
  organizer: z.string(),
  /** The owning user — used by the page's draft-visibility guard. */
  organizerUserId: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  venue: z.string().nullable(),
  address: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** Cheapest public (non-code-gated) tier, integer cents. Null = none on sale. */
  fromPriceCents: z.number().int().nullable(),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;
