import type { PrismaClient } from '@troptix/db';
import { Prisma } from '@troptix/db';
import type {
  EventDetail,
  EventDetailInput,
  EventSummary,
  EventTicket,
} from '../contracts/events';
import { parseStoredFlyerPalette } from '../contracts/events';
import { calculateFeesCents } from './_shared/fees';
import { publicEventsWhere } from './_shared/publicEvents';
import { toEventSummary } from './_shared/eventSummary';
import { getSaleState } from './_shared/saleState';
import { NotFoundError } from './_shared/errors';

const SALE_STATUS = {
  Scheduled: 'notYetOnSale',
  OnSale: 'onSale',
  Ended: 'saleEnded',
} as const;

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

export async function getEventDetail(
  prisma: PrismaClient,
  input: EventDetailInput
): Promise<EventDetail> {
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
    },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${input.eventId} not found.`);
  }

  const now = new Date();
  const tickets: EventTicket[] = event.ticketTypes
    .map((tt) => {
      const priceCents = tt.priceCents ?? Math.round(tt.price * 100);
      const availability = Math.max(0, tt.capacity - tt.reserved - tt.sold);
      const saleStatus: EventTicket['saleStatus'] =
        availability === 0 ? 'soldOut' : SALE_STATUS[getSaleState(tt, now)];
      const maxAllowedToAdd =
        saleStatus === 'onSale' && !event.isDraft
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
        saleStatus,
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
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
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
