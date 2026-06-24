/**
 * Checkout contracts — the single zod definition of the checkout wire shape.
 *
 * One schema serves three roles (ADR 0009): services `.parse()` inputs at the
 * trust boundary, the tRPC adapter uses them as `.input`/output, and clients
 * derive types via `z.infer`. This is the **contract-freeze point** the Stage 2
 * plan calls out — the Stage 3 checkout redesign builds against these shapes.
 *
 * RN-safe: this module imports zod + `@troptix/db/types` (type-only) ONLY. It
 * must never import the `@troptix/db` runtime entry, so it can live in the
 * type-only barrel a React-Native client may import.
 *
 * Money is integer **cents** everywhere (roadmap 2.12) — matching the
 * reservation service (`unitPriceCents`/`feesCents`) and the new `priceCents`
 * column. The legacy dollar-`Float` `apps/web/src/types/checkout.ts` is retained
 * unchanged for the un-wired legacy routes until the Stage 3 cutover retires it.
 */
import { z } from 'zod';
import type {
  ReservationStatus,
  TicketFeeStructure,
  TicketType,
} from '@troptix/db/types';

// --- Prisma enums mirrored as zod string enums --------------------------------
// We can't import the enum *values* from `@troptix/db` (runtime entry) without
// breaking RN-safety, and `@troptix/db/types` is type-only. So the values are
// re-declared here; the parity guards below fail to compile if they ever drift
// from the Prisma definitions.

export const feeStructureSchema = z.enum([
  'ABSORB_TICKET_FEES',
  'PASS_TICKET_FEES',
]);

export const ticketTypeSchema = z.enum(['FREE', 'PAID', 'COMPLEMENTARY']);

type AssertEqual<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;

// Resolve to `never` (so the `= true` assignment fails to compile) if the zod
// enum ever diverges from the Prisma enum it mirrors.
const _feeStructureParity: AssertEqual<
  z.infer<typeof feeStructureSchema>,
  TicketFeeStructure
> = true;
const _ticketTypeParity: AssertEqual<
  z.infer<typeof ticketTypeSchema>,
  TicketType
> = true;

// --- Validation / message enums (ported from types/checkout.ts) ---------------

export const validationResponseMessageSchema = z.enum([
  'Some tickets were unavailable or sold out and cart was adjusted',
  'Tickets are available',
  'All tickets are unavailable',
  'No tickets selected',
  'Missing required fields or no tickets selected',
]);
export type ValidationResponseMessage = z.infer<
  typeof validationResponseMessageSchema
>;

export const validatedItemMessageSchema = z.enum([
  'Available',
  'Quantity Reduced: Max Available',
  'Sold Out',
  'Sale Not Started',
  'Sale Ended',
  'Ticket Type Not Found',
]);
export type ValidatedItemMessage = z.infer<typeof validatedItemMessageSchema>;

// --- CheckoutTicket -----------------------------------------------------------

export const checkoutTicketSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Integer cents (← `priceCents`). */
  priceCents: z.number().int(),
  /** ISO-8601 string of the single-DateTime sale window start (← `saleStartsAt`). */
  saleStartsAt: z.string().datetime(),
  saleEndsAt: z.string().datetime(),
  /** Quantity the buyer may add now — clamped to availability, max-per-user, sale window, draft state. */
  maxAllowedToAdd: z.number().int(),
  /** Per-ticket fee in integer cents (0 when the organizer absorbs fees). */
  feesCents: z.number().int(),
  feeStructure: feeStructureSchema,
  ticketType: ticketTypeSchema.nullable(),
  /** True when 0 < availability < 10 — drives the "almost gone" UI hint. */
  ticketQuantityLow: z.boolean(),
  /** Present only on a ticket unlocked via a discount/password code. */
  isPasswordProtected: z.boolean().optional(),
});
export type CheckoutTicket = z.infer<typeof checkoutTicketSchema>;

export const checkoutConfigResponseSchema = z.object({
  tickets: z.array(checkoutTicketSchema),
  message: z.string().optional(),
});
export type CheckoutConfigResponse = z.infer<
  typeof checkoutConfigResponseSchema
>;

// --- applyCode ----------------------------------------------------------------

export const applyCodeInputSchema = z.object({
  eventId: z.string().min(1),
  code: z.string().min(1),
});
export type ApplyCodeInput = z.infer<typeof applyCodeInputSchema>;

export const applyCodeResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('password'),
    isValid: z.literal(true),
    message: z.string(),
    unlockedTicket: checkoutTicketSchema,
  }),
  z.object({
    type: z.literal('invalid'),
    isValid: z.literal(false),
    message: z.string(),
  }),
]);
export type ApplyCodeResponse = z.infer<typeof applyCodeResponseSchema>;

// --- getCheckoutConfig input --------------------------------------------------

export const checkoutConfigInputSchema = z.object({
  eventId: z.string().min(1),
});
export type CheckoutConfigInput = z.infer<typeof checkoutConfigInputSchema>;

// --- Validation (initiate path) ----------------------------------------------
// Frozen here so the Stage 3 initiate rewrite (PR 2c) has the target shape;
// the service is built in a later PR. Cents + reservation-id, not the legacy
// dollar/orderId shape.

export const initiateCheckoutItemSchema = z.object({
  ticketTypeId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
});
export type InitiateCheckoutItem = z.infer<typeof initiateCheckoutItemSchema>;

/**
 * Input for the initiate mutation — the buyer's cart at commit time. `code` is
 * the unlock code when the cart contains a password-gated ticket; the signed-in
 * user id is NOT wire input (the server takes it from the actor — ADR 0013).
 */
export const initiateCheckoutInputSchema = z.object({
  eventId: z.string().min(1),
  items: z.array(initiateCheckoutItemSchema).min(1).max(20),
  contact: z.object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
  }),
  code: z.string().min(1).optional(),
});
export type InitiateCheckoutInput = z.infer<typeof initiateCheckoutInputSchema>;

// --- Reservation status (post-payment polling) ---------------------------------

export const reservationStatusSchema = z.enum([
  'HELD',
  'CONVERTED',
  'EXPIRED',
  'RELEASED',
]);
const _reservationStatusParity: AssertEqual<
  z.infer<typeof reservationStatusSchema>,
  ReservationStatus
> = true;

export const reservationStatusResponseSchema = z.object({
  reservationId: z.string(),
  status: reservationStatusSchema,
  /** Set once the webhook (or a synchronous free confirm) materializes the order. */
  orderId: z.string().nullable(),
  expiresAt: z.string().datetime(),
});
export type ReservationStatusResponse = z.infer<
  typeof reservationStatusResponseSchema
>;

export const reservationStatusInputSchema = z.object({
  reservationId: z.string().min(1),
});
export type ReservationStatusInput = z.infer<
  typeof reservationStatusInputSchema
>;

export const validatedItemSchema = z.object({
  ticketTypeId: z.string(),
  name: z.string(),
  requestedQuantity: z.number().int(),
  validatedQuantity: z.number().int(),
  pricePerTicketCents: z.number().int(),
  feesPerTicketCents: z.number().int(),
  message: validatedItemMessageSchema,
});
export type ValidatedItem = z.infer<typeof validatedItemSchema>;

export const validationResponseSchema = z.object({
  isValid: z.boolean(),
  wasAdjusted: z.boolean(),
  validatedItems: z.array(validatedItemSchema),
  subtotalCents: z.number().int(),
  feesCents: z.number().int(),
  totalCents: z.number().int(),
  promotionApplied: z.string().nullable(),
  message: validationResponseMessageSchema.nullable(),
  isFree: z.boolean(),
  reservationId: z.string().nullable(),
  clientSecret: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
});
export type ValidationResponse = z.infer<typeof validationResponseSchema>;
