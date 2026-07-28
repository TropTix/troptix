/**
 * The persisted shape of a ticket type from its write input — the one place
 * the FREE/PAID derivation and the legacy float mirror live, shared by the
 * event-create and ticket-type write seams so the 2.12 float retirement is a
 * one-file change.
 */
import type { TicketTypeInput } from '../../contracts/organizer';

export function ticketTypeWriteFields(input: TicketTypeInput) {
  return {
    name: input.name,
    description: input.description ?? '',
    ticketType: input.priceCents === 0 ? ('FREE' as const) : ('PAID' as const),
    priceCents: input.priceCents,
    // Legacy float mirror, until the 2.12 cutover retires it.
    price: input.priceCents / 100,
    capacity: input.capacity,
    maxPurchasePerUser: input.maxPurchasePerUser,
    saleStartsAt: input.saleStartsAt,
    saleEndsAt: input.saleEndsAt,
    ticketingFees: input.ticketingFees,
    discountCode: input.discountCode || null,
  };
}
