import prisma from '@/server/prisma';
import EventDetail from './_components/EventDetails';
import { Prisma } from '@prisma/client';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';

const EventByIdSelect: Prisma.EventsSelect = {
  id: true,
  name: true,
  description: true,
  imageUrl: true,
  isDraft: true,
  organizerUserId: true,
  startDate: true,
  endDate: true,
  venue: true,
  address: true,
  organizer: true,
  latitude: true,
  longitude: true,
  ticketTypes: {
    select: {
      price: true,
    },
    where: {
      OR: [
        {
          discountCode: { equals: null },
        },
        {
          discountCode: { equals: '' },
        },
      ],
    },
    orderBy: {
      price: Prisma.SortOrder.asc,
    },
    take: 1,
  },
};

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

export async function generateMetadata(
  props: {
    params: Promise<{ eventId: string }>;
  }
) {
  const params = await props.params;
  const event = await getEventById(params.eventId);
  return {
    title: event?.name,
    isDraft: event?.isDraft,
    description: event?.description,
    openGraph: {
      title: event?.name,
      description: event?.description,
      images: [event?.imageUrl],
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

  return <EventDetail event={event} />;
}
