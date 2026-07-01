/**
 * Shared shaping for the `EventSummary` discovery-card DTO — used by the public
 * events listing and the organization page. Keeps the "cheapest public tier →
 * fromPriceCents" derivation in one place. `select` the same fields (id, name,
 * imageUrl, startDate, endDate, venue, + the cheapest public tier) into a row of
 * this shape, then map it here.
 */
import type { EventSummary } from '../../contracts/events';

export type EventSummaryRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  startDate: Date;
  endDate: Date;
  venue: string | null;
  ticketTypes: { priceCents: number | null; price: number }[];
};

export function toEventSummary(event: EventSummaryRow): EventSummary {
  const cheapest = event.ticketTypes[0];
  const fromPriceCents = cheapest
    ? (cheapest.priceCents ?? Math.round(cheapest.price * 100))
    : null;

  return {
    id: event.id,
    name: event.name,
    imageUrl: event.imageUrl,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
    venue: event.venue,
    fromPriceCents,
  };
}
