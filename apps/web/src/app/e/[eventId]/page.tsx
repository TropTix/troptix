import prisma from '@/server/prisma';
import { Prisma } from '@troptix/db';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { eventFlyerUrl } from '@/lib/supabase/storage';
import EventPageClean from './_components/EventPageClean';

// New event page (Clean direction) — built on a parallel `/e/[eventId]` route
// while legacy `/events/[eventId]` stays live. See
// docs/plans/2026-06-event-page-redesign.md. Phase 1: route + data layer.

// The page itself renders only event meta + a "From $X" price, but the full
// tier list is fetched here to seat the data layer the Stage 3 checkout sheet
// will consume.
const EventByIdSelect = {
  id: true,
  name: true,
  description: true,
  summary: true,
  imageUrl: true,
  isDraft: true,
  organizer: true,
  organizerUserId: true,
  startDate: true,
  startTime: true,
  endDate: true,
  endTime: true,
  venue: true,
  address: true,
  latitude: true,
  longitude: true,
  ticketTypes: {
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      ticketType: true,
      discountCode: true,
      quantity: true,
      capacity: true,
      reserved: true,
      sold: true,
      maxPurchasePerUser: true,
      saleStartDate: true,
      saleEndDate: true,
    },
    orderBy: {
      price: Prisma.SortOrder.asc,
    },
  },
} satisfies Prisma.EventsSelect;

export type EventById = Prisma.EventsGetPayload<{
  select: typeof EventByIdSelect;
}>;

async function getEventById(eventId: string): Promise<EventById | null> {
  const event = await prisma.events.findUnique({
    select: EventByIdSelect,
    where: { id: eventId },
  });

  if (!event) {
    notFound();
  }

  return event;
}

export async function generateMetadata(props: {
  params: Promise<{ eventId: string }>;
}) {
  const params = await props.params;
  const event = await getEventById(params.eventId);
  // OG images must be absolute URLs; resolve the stored path (ADR 0016).
  const ogImage = eventFlyerUrl(event?.imageUrl);
  return {
    title: event?.name,
    isDraft: event?.isDraft,
    description: event?.description,
    openGraph: {
      title: event?.name,
      description: event?.description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const user = await getUserFromIdTokenCookie();
  const { eventId } = await params;
  const event = await getEventById(eventId);

  if (!event || (event.isDraft && user?.uid !== event.organizerUserId)) {
    notFound();
  }

  return <EventPageClean event={event} />;
}
