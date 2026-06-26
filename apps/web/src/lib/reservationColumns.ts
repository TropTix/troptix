// Maps the legacy ticket-type fields to the reservation-era columns the new
// checkout reads (capacity / priceCents / single-DateTime sale window). Dual-
// written wherever a ticket type is created or edited, until the legacy columns
// are dropped in the Stage-3 cleanup.
export function reservationColumns(input: {
  quantity: number;
  price: number;
  saleStartDate: Date;
  saleEndDate: Date;
}) {
  return {
    capacity: input.quantity,
    priceCents: Math.round(input.price * 100),
    saleStartsAt: input.saleStartDate,
    saleEndsAt: input.saleEndDate,
  };
}
