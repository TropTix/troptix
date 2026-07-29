import { BackButton } from '@/components/ui/back-button';
import prisma from '@/server/prisma';
import { parseStoredFlyerPalette } from '@troptix/api';
import EventForm from '../../_components/EventForm';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import type { ServerUser } from '@/server/authUser';
import { redirect } from 'next/navigation';

interface EditEventPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

// Ownership scoping in the query is the access check — null means 404.
async function getEvent(eventId: string, user: ServerUser) {
  try {
    const event = await prisma.events.findUnique({
      where: { id: eventId, organizerUserId: user.uid },
      include: {
        ticketTypes: {
          select: {
            name: true,
            price: true,
            capacity: true,
            description: true,
            maxPurchasePerUser: true,
            saleStartsAt: true,
            saleEndsAt: true,
            ticketingFees: true,
            discountCode: true,
          },
        },
      },
    });
    return event;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export default async function EditEventPage(props: EditEventPageProps) {
  const params = await props.params;
  const { eventId } = params;

  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  const event = await getEvent(eventId, user);

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

  // Host brand for the read-only "Hosted by" line on the form. Paid ticketing
  // is the Organization's approval — the same flag the write service enforces.
  const org = await prisma.organization.findFirst({
    where: { ownerUserId: user.uid },
    select: { displayName: true, paidTicketingEnabled: true },
  });
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
