import type { PrismaClient } from '@troptix/db';
import { Prisma } from '@troptix/db';
import type {
  EventDetail,
  EventDetailInput,
  EventSummary,
  EventTicket,
} from '../contracts/events';
import { parseStoredFlyerPalette } from '../contracts/events';
import { publicEventsWhere } from './_shared/publicEvents';
import { toEventSummary } from './_shared/eventSummary';
import { sortEventTickets, toEventTicket } from './_shared/eventTicket';
import { NotFoundError } from './_shared/errors';

export async function listPublicEvents(
  prisma: PrismaClient
): Promise<EventSummary[]> {
  const events = await prisma.events.findMany({
    where: {
      ...publicEventsWhere,
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
    },
  });

  return events.map(toEventSummary);
}

/**
 * Cacheable half of the event read: JSON-safe, no clock-derived fields — those
 * live in `shapeEventDetail` so a cached row can't freeze a sale transition.
 */
export async function getEventDetailRaw(
  prisma: PrismaClient,
  input: EventDetailInput
) {
  // Drafts ARE returned: the page does its own draft guard via
  // isDraft/organizerUserId (organizer preview) — don't filter them here.
  const event = await prisma.events.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      name: true,
      description: true,
      summary: true,
      imageUrl: true,
      isDraft: true,
      isPrivate: true,
      organizer: true,
      organizerUserId: true,
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
      pageTheme: true,
      flyerPalette: true,
      ticketTypes: {
        where: { accessCode: null },
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
    },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${input.eventId} not found.`);
  }

  return {
    ...event,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    ticketTypes: event.ticketTypes.map((tt) => ({
      ...tt,
      saleStartsAt: tt.saleStartsAt.toISOString(),
      saleEndsAt: tt.saleEndsAt.toISOString(),
    })),
  };
}

export type EventDetailRaw = Awaited<ReturnType<typeof getEventDetailRaw>>;

export function shapeEventDetail(
  event: EventDetailRaw,
  now: Date
): EventDetail {
  const tickets: EventTicket[] = sortEventTickets(
    event.ticketTypes.map((tt) => toEventTicket(tt, event.isDraft, now))
  );

  const fromPriceCents =
    tickets.length > 0 ? Math.min(...tickets.map((t) => t.priceCents)) : null;

  return {
    id: event.id,
    name: event.name,
    description: event.description,
    summary: event.summary,
    imageUrl: event.imageUrl,
    isDraft: event.isDraft,
    isPrivate: event.isPrivate,
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
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    venue: event.venue,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    pageTheme: event.pageTheme,
    flyerPalette: parseStoredFlyerPalette(event.flyerPalette),
    fromPriceCents,
    tickets,
  };
}

export async function getEventDetail(
  prisma: PrismaClient,
  input: EventDetailInput
): Promise<EventDetail> {
  return shapeEventDetail(await getEventDetailRaw(prisma, input), new Date());
}
