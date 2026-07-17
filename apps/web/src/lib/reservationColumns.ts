// Maps the legacy ticket-type fields to the reservation-era columns the new
// checkout reads. Dual-written wherever a ticket type is created or edited,
// until the legacy columns are dropped in the Stage-3 cleanup.
//
// The sale window is no longer here: the duplicate atomic columns were dropped
// and the surviving pair renamed to `saleStartsAt`/`saleEndsAt` in ADR 0020's
// sibling migration, so the form writes them directly. These two remain because
// they are real conversions, not renames.
export function reservationColumns(input: { quantity: number; price: number }) {
  return {
    capacity: input.quantity,
    priceCents: Math.round(input.price * 100),
  };
}
