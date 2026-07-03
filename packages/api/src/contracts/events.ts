import { z } from 'zod';

// --- EventDetail --------------------------------------------------------------
// The public event-page DTO: event meta + a server-computed "From $X" price.
// Client-safe by construction — no ticket rows, no discount codes, no gated-tier
// data ever reaches the browser; the cheapest public price is pre-derived here.

export const eventDetailInputSchema = z.object({
  eventId: z.string().min(1),
});
export type EventDetailInput = z.infer<typeof eventDetailInputSchema>;

// A public ticket tier, shaped for the event page's selection sheet. No
// discount codes or raw inventory counts — `maxAllowedToAdd` (0 when sold out /
// off-sale / draft) is all the client needs.
export const eventTicketSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Integer cents (priceCents, legacy price*100 fallback). */
  priceCents: z.number().int(),
  /** Per-ticket fee in integer cents (0 when the organizer absorbs fees). */
  feesCents: z.number().int(),
  /** Quantity the buyer may add now — clamped to availability, max-per-user, sale window, draft. */
  maxAllowedToAdd: z.number().int(),
});
export type EventTicket = z.infer<typeof eventTicketSchema>;

// --- EventSummary -------------------------------------------------------------
// The discovery-listing DTO: just what an event card renders. The cheapest
// public price is pre-derived server-side (`fromPriceCents`); no tier rows or
// discount codes reach the browser.

export const eventSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Stored flyer path (resolved to an absolute URL by the web layer). */
  imageUrl: z.string().nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  venue: z.string().nullable(),
  /** Cheapest public tier, integer cents. Null = free / no public tiers. */
  fromPriceCents: z.number().int().nullable(),
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

// --- Spotlight ----------------------------------------------------------------
// A curated per-event card (DJ, artist, speaker, sponsor, …). Links out; `link`
// may lack a scheme (the web layer prepends https), `imageUrl` is a stored path.
export const spotlightItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  link: z.string().nullable(),
  imageUrl: z.string().nullable(),
  description: z.string().nullable(),
});
export type SpotlightItem = z.infer<typeof spotlightItemSchema>;

// Authoring input: one card as the organizer submits it. `title` is required;
// everything else is optional. Order is positional — the array index becomes the
// stored `order`, so the client sends cards in display order. Empty strings from
// the form are normalized to null.
const emptyToNull = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(2000).nullable()
);
export const spotlightInputItemSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  link: emptyToNull,
  imageUrl: emptyToNull,
  description: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(350).nullable()
  ),
});
export type SpotlightInputItem = z.infer<typeof spotlightInputItemSchema>;

export const saveEventSpotlightInputSchema = z.object({
  eventId: z.string().min(1),
  items: z.array(spotlightInputItemSchema).max(50),
});
export type SaveEventSpotlightInput = z.infer<
  typeof saveEventSpotlightInputSchema
>;

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
  /** The hosting Organization (brand) for the "Hosted by" block → /o/[slug]. */
  hostedBy: z
    .object({
      slug: z.string(),
      displayName: z.string(),
      /** Stored logo path (resolved to a URL by the web layer). */
      logoUrl: z.string().nullable(),
      verified: z.boolean(),
      instagram: z.string().nullable(),
      twitter: z.string().nullable(),
      linkedin: z.string().nullable(),
      website: z.string().nullable(),
    })
    .nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  venue: z.string().nullable(),
  address: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** Cheapest public tier, integer cents. Null = no public tiers. */
  fromPriceCents: z.number().int().nullable(),
  /** Public (non-code-gated) tiers, available first then by price. */
  tickets: z.array(eventTicketSchema),
  /** Curated spotlight cards (DJs, sponsors, …), in display order. */
  spotlight: z.array(spotlightItemSchema),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;
