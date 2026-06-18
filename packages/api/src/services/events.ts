/**
 * Canonical public read for the event page: fetches the event and its public
 * tiers in one query and shapes both here, independent of the read-side checkout
 * services (slated for rework).
 *
 * Prisma is injected (unit-testable). No authorization (ADR 0013) — keyed by
 * `eventId`; the page does its own draft guard via `isDraft`/`organizerUserId`.
 * Only public (non-gated) tiers are returned, with no discount codes; new
 * columns fall back to legacy sources until the Stage-3 backfill.
 */
import type { PrismaClient } from '@troptix/db';
import type {
  EventDetail,
  EventDetailInput,
  EventTicket,
} from '../contracts/events';
import { calculateFeesCents } from './_shared/fees';
import { NotFoundError } from './_shared/errors';

export async function getEventDetail(
  prisma: PrismaClient,
  input: EventDetailInput
): Promise<EventDetail> {
  const event = await prisma.events.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      name: true,
      description: true,
      summary: true,
      imageUrl: true,
      isDraft: true,
      organizer: true,
      organizerUserId: true,
      startDate: true,
      endDate: true,
      venue: true,
      address: true,
      latitude: true,
      longitude: true,
      // Public tiers only (a null/empty discount code means public).
      ticketTypes: {
        where: {
          OR: [
            { discountCode: { equals: null } },
            { discountCode: { equals: '' } },
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          priceCents: true,
          price: true,
          ticketingFees: true,
          capacity: true,
          quantity: true,
          reserved: true,
          sold: true,
          maxPurchasePerUser: true,
          saleStartsAt: true,
          saleStartDate: true,
          saleEndsAt: true,
          saleEndDate: true,
        },
      },
    },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${input.eventId} not found.`);
  }

  const now = new Date();
  const tickets: EventTicket[] = event.ticketTypes
    .map((tt) => {
      // New columns with legacy fallbacks (until the Stage-3 backfill).
      const priceCents = tt.priceCents ?? Math.round(tt.price * 100);
      const capacity = tt.capacity ?? tt.quantity;
      const saleStartsAt = tt.saleStartsAt ?? tt.saleStartDate;
      const saleEndsAt = tt.saleEndsAt ?? tt.saleEndDate;

      const availability = Math.max(0, capacity - tt.reserved - tt.sold);
      const onSale = now >= saleStartsAt && now <= saleEndsAt;
      const maxAllowedToAdd =
        onSale && !event.isDraft
          ? Math.max(0, Math.min(availability, tt.maxPurchasePerUser))
          : 0;
      const feesCents =
        tt.ticketingFees === 'PASS_TICKET_FEES'
          ? calculateFeesCents(priceCents)
          : 0;

      return {
        id: tt.id,
        name: tt.name,
        description: tt.description,
        priceCents,
        feesCents,
        maxAllowedToAdd,
      };
    })
    .sort((a, b) => {
      const aOut = a.maxAllowedToAdd > 0 ? 0 : 1;
      const bOut = b.maxAllowedToAdd > 0 ? 0 : 1;
      return aOut !== bOut ? aOut - bOut : a.priceCents - b.priceCents;
    });

  const fromPriceCents =
    tickets.length > 0 ? Math.min(...tickets.map((t) => t.priceCents)) : null;

  return {
    id: event.id,
    name: event.name,
    description: event.description,
    summary: event.summary,
    imageUrl: event.imageUrl,
    isDraft: event.isDraft,
    organizer: event.organizer,
    organizerUserId: event.organizerUserId,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
    venue: event.venue,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    fromPriceCents,
    tickets,
  };
}
