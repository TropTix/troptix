import { z } from 'zod';

// Public DTOs — client-safe by construction: no ticket rows, discount codes,
// raw inventory counts, or gated-tier data may ever appear here.

export const eventDetailInputSchema = z.object({
  eventId: z.string().min(1),
});
export type EventDetailInput = z.infer<typeof eventDetailInputSchema>;

export const eventPageThemeSchema = z.enum(['off', 'wash', 'dark']);
export type EventPageTheme = z.infer<typeof eventPageThemeSchema>;

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const flyerPaletteSchema = z.object({
  dominant: hexColor,
  /** Best first. Empty means no usable color — the themes are unavailable. */
  candidates: z.array(hexColor).max(5),
  /** When absent the lead accent is `candidates[0]` (the auto-pick). */
  chosenAccent: hexColor.nullable().optional(),
});
export type FlyerPalette = z.infer<typeof flyerPaletteSchema>;

export function parseStoredFlyerPalette(value: unknown): FlyerPalette | null {
  return flyerPaletteSchema
    .nullable()
    .catch(null)
    .parse(value ?? null);
}

export const eventTicketSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int(),
  /** Per-ticket fee in integer cents (0 when the organizer absorbs fees). */
  feesCents: z.number().int(),
  maxAllowedToAdd: z.number().int(),
  /** Sold-out wins over the window; ignores draft (that only zeroes `maxAllowedToAdd`). */
  saleStatus: z.enum(['onSale', 'notYetOnSale', 'saleEnded', 'soldOut']),
});
export type EventTicket = z.infer<typeof eventTicketSchema>;

// Deliberately no tier data on listings — prices live on the event detail
// page, so listings never depend on tiers.
export const eventSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Stored flyer path (resolved to an absolute URL by the web layer). */
  imageUrl: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venue: z.string().nullable(),
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
  organizerUserId: z.string(),
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
  /** Cheapest public tier. Null = no public tiers, not free. */
  fromPriceCents: z.number().int().nullable(),
  pageTheme: eventPageThemeSchema,
  flyerPalette: flyerPaletteSchema.nullable(),
  tickets: z.array(eventTicketSchema),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;
