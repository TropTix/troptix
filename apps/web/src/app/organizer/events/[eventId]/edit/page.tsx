import { BackButton } from '@/components/ui/back-button';
import prisma from '@/server/prisma';
import { getEventForEdit } from '@troptix/api/server';
import { userToActor } from '@/server/actor';
import { parseStoredFlyerPalette } from '@troptix/api';
import EventForm from '../../_components/EventForm';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';

interface EditEventPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

import type { ServerUser } from '@/server/authUser';

// Ownership scoping in the query is the access check — null means 404.
// Errors propagate to the error boundary; a DB failure is not a 404.
async function getEvent(eventId: string, user: ServerUser) {
  return getEventForEdit(prisma, userToActor(user), eventId);
}

export default async function EditEventPage(props: EditEventPageProps) {
  const params = await props.params;
  const { eventId } = params;

  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }
  const { event, organization: org } = await getEvent(eventId, user);

  if (!event) {
    notFound();
  }

  const initialData = {
    ...event,
    eventName: event?.name,
    startsAt: event?.startsAt,
    endsAt: event?.endsAt,
    venue: event?.venue ?? '',
    address: event?.address ?? '',
    country: event?.country ?? '',
    countryCode: event?.countryCode ?? '',
    latitude: event?.latitude ?? null,
    longitude: event?.longitude ?? null,
    imageUrl: event?.imageUrl ?? '',
    description: event?.description ?? '',
    pageTheme: event.pageTheme,
    flyerPalette: parseStoredFlyerPalette(event.flyerPalette),
  };

  const paidEventsEnabled = org?.paidTicketingEnabled ?? false;

  return (
    <div className=" mx-auto py-8">
      <div className="mb-6 flex items-center gap-2">
        <BackButton />
        <h1 className="text-2xl font-semibold">Edit Event</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Update the details for the &apos;{event?.name}&apos; event.
      </p>
      <EventForm
        initialData={initialData}
        eventId={eventId}
        ticketTypes={
          event?.ticketTypes.map((ticket) => ({
            ...ticket,
            discountCode: ticket.discountCode || undefined,
          })) ?? []
        }
        isDraft={event.isDraft}
        paidEventsEnabled={paidEventsEnabled}
        organizationName={org?.displayName}
      />
    </div>
  );
}
