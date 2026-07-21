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
import { Prisma } from '@troptix/db';
import type {
  EventDetail,
  EventDetailInput,
  EventSummary,
  EventTicket,
} from '../contracts/events';
import { calculateFeesCents } from './_shared/fees';
import { toEventSummary } from './_shared/eventSummary';
import { NotFoundError } from './_shared/errors';

/**
 * Public discovery listing: upcoming, non-draft events shaped for the cards on
 * `/discover`. Soonest-first. The cheapest public price is pre-derived here
 * (`fromPriceCents`) so no tier rows or discount codes reach the browser. New
 * `priceCents` column falls back to legacy `price * 100` until the backfill.
 */
export async function listPublicEvents(
  prisma: PrismaClient
): Promise<EventSummary[]> {
  const events = await prisma.events.findMany({
    where: {
      isDraft: false,
      endsAt: { gt: new Date() },
    },
    orderBy: { startsAt: Prisma.SortOrder.asc },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      startsAt: true,
      endsAt: true,
      venue: true,
      // Cheapest public tier only (a null/empty discount code means public).
      ticketTypes: {
        where: {
          OR: [
            { discountCode: { equals: null } },
            { discountCode: { equals: '' } },
          ],
        },
        select: { priceCents: true, price: true },
        orderBy: { price: Prisma.SortOrder.asc },
        take: 1,
      },
    },
  });

  return events.map(toEventSummary);
}

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
      // The hosting Organization (brand) for the "Hosted by" block → /o/[slug].
      organization: {
        select: {
          slug: true,
          displayName: true,
          logoUrl: true,
          verified: true,
          instagram: true,
          twitter: true,
          linkedin: true,
          website: true,
        },
      },
      startsAt: true,
      endsAt: true,
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
          reserved: true,
          sold: true,
          maxPurchasePerUser: true,
          saleStartsAt: true,
          saleEndsAt: true,
        },
      },
      spotlight: {
        select: {
          id: true,
          title: true,
          link: true,
          imageUrl: true,
          description: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${input.eventId} not found.`);
  }

  const now = new Date();
  const tickets: EventTicket[] = event.ticketTypes
    .map((tt) => {
      // priceCents falls back to price * 100; the sale window needs no fallback
      // — one pair, full timestamps (ADR 0020).
      const priceCents = tt.priceCents ?? Math.round(tt.price * 100);
      const availability = Math.max(0, tt.capacity - tt.reserved - tt.sold);
      const onSale = now >= tt.saleStartsAt && now <= tt.saleEndsAt;
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
    hostedBy: event.organization
      ? {
          slug: event.organization.slug,
          displayName: event.organization.displayName,
          logoUrl: event.organization.logoUrl,
          verified: event.organization.verified,
          instagram: event.organization.instagram,
          twitter: event.organization.twitter,
          linkedin: event.organization.linkedin,
          website: event.organization.website,
        }
      : null,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    venue: event.venue,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    fromPriceCents,
    tickets,
    spotlight: event.spotlight,
  };
}
