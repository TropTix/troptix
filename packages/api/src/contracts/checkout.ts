import { z } from 'zod';
import type { TicketFeeStructure, TicketType } from '@troptix/db/types';

// Enum values re-declared, not imported — the `@troptix/db` runtime entry would
// break RN-safety, and `@troptix/db/types` is type-only.

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

export const checkoutTicketSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int(),
  saleStartsAt: z.string().datetime(),
  saleEndsAt: z.string().datetime(),
  maxAllowedToAdd: z.number().int(),
  /** Per-ticket fee in integer cents (0 when the organizer absorbs fees). */
  feesCents: z.number().int(),
  feeStructure: feeStructureSchema,
  ticketType: ticketTypeSchema.nullable(),
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

export const applyCodeInputSchema = z.object({
  eventId: z.string().min(1),
  code: z.string().min(1).max(100),
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

export const checkoutConfigInputSchema = z.object({
  eventId: z.string().min(1),
});
export type CheckoutConfigInput = z.infer<typeof checkoutConfigInputSchema>;

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
