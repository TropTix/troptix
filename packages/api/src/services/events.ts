/**
 * Read-side event service for the public event page. Built first-principles on
 * the reservation-era model — independent of the read-side checkout services so
 * it doesn't churn when those are optimized.
 *
 * Prisma is injected (framework-agnostic, unit-testable with a fake). The read
 * is keyed off `eventId`, so — like the other public reads — it carries no
 * authorization (ADR 0013); the page applies its own draft-visibility guard
 * using the returned `isDraft` / `organizerUserId`.
 *
 * "From $X" is computed here so the browser never receives raw ticket rows or
 * discount codes: only public (non-code-gated) tiers are considered, and the
 * cheapest price is returned as integer cents. `priceCents` is the new column
 * with a legacy `price` fallback until the Stage-3 backfill populates it.
 */
import type { PrismaClient } from '@troptix/db';
import type { EventDetail, EventDetailInput } from '../contracts/events';
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
      // Public tiers only (a null/empty discount code means public), reduced to
      // the cheapest price below — these rows never leave this function.
      ticketTypes: {
        where: {
          OR: [
            { discountCode: { equals: null } },
            { discountCode: { equals: '' } },
          ],
        },
        select: { priceCents: true, price: true },
      },
    },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${input.eventId} not found.`);
  }

  const fromPriceCents =
    event.ticketTypes.length > 0
      ? Math.min(
          ...event.ticketTypes.map(
            (t) => t.priceCents ?? Math.round(t.price * 100)
          )
        )
      : null;

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
  };
}
