import { z } from 'zod';

// --- EventDetail --------------------------------------------------------------
// The public event-page DTO: event meta + a server-computed "From $X" price.
// Client-safe by construction — no ticket rows, no discount codes, no gated-tier
// data ever reaches the browser; the cheapest public price is pre-derived here.

export const eventDetailInputSchema = z.object({
  eventId: z.string().min(1),
});
export type EventDetailInput = z.infer<typeof eventDetailInputSchema>;

// --- Flyer theming ------------------------------------------------------------
// The organizer-chosen page treatment plus the colors extracted once from the
// flyer at upload. Stored raw (hex) so the derivation — which lives in the web
// layer — can evolve without a data backfill.

export const eventPageThemeSchema = z.enum(['off', 'wash', 'dark']);
export type EventPageTheme = z.infer<typeof eventPageThemeSchema>;

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const flyerPaletteSchema = z.object({
  /** Most frequent color — often the poster's background. */
  dominant: hexColor,
  /**
   * Distinct vivid colors, best first — the organizer's swatch row. Empty
   * means the flyer has no usable color and the themes are unavailable.
   */
  candidates: z.array(hexColor).max(5),
  /**
   * The candidate the organizer picked to lead the theme; when absent the
   * lead is `candidates[0]` (the auto-pick).
   */
  chosenAccent: hexColor.nullable().optional(),
});
export type FlyerPalette = z.infer<typeof flyerPaletteSchema>;

/**
 * Read a stored (JSONB) palette: malformed rows degrade to null — "no
 * palette", the brand theme — instead of breaking the read.
 */
export function parseStoredFlyerPalette(value: unknown): FlyerPalette | null {
  return flyerPaletteSchema
    .nullable()
    .catch(null)
    .parse(value ?? null);
}

// A public ticket tier, shaped for the event page's selection sheet. No
// discount codes or raw inventory counts — `maxAllowedToAdd` (0 when sold out /
// off-sale / draft) plus a coarse `saleStatus` is all the client needs.
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
  /** Sold-out wins over the window; ignores draft (that only zeroes `maxAllowedToAdd`). */
  saleStatus: z.enum(['onSale', 'notYetOnSale', 'saleEnded', 'soldOut']),
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
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venue: z.string().nullable(),
  /** Cheapest public tier, integer cents. Null = free / no public tiers. */
  fromPriceCents: z.number().int().nullable(),
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

export const eventDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  summary: z.string().nullable(),
  /** Stored flyer path (resolved to an absolute URL by the web layer). */
  imageUrl: z.string().nullable(),
  isDraft: z.boolean(),
  isPrivate: z.boolean(),
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
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venue: z.string().nullable(),
  address: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** Cheapest public tier, integer cents. Null = no public tiers. */
  fromPriceCents: z.number().int().nullable(),
  /** Organizer-chosen page treatment; 'off' renders the brand theme. */
  pageTheme: eventPageThemeSchema,
  /** Colors extracted from the flyer at upload; null when never extracted. */
  flyerPalette: flyerPaletteSchema.nullable(),
  /** Public (non-code-gated) tiers, available first then by price. */
  tickets: z.array(eventTicketSchema),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;
