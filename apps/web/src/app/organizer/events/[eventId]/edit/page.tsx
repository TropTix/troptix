import { BackButton } from '@/components/ui/back-button';
import prisma from '@/server/prisma';
import EventForm from '../../_components/EventForm';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import { verifyEventAccess, getEventWhereClause } from '@/server/accessControl';

interface EditEventPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

async function getEvent(eventId: string, userId: string, userEmail?: string) {
  try {
    // Verify access first
    await verifyEventAccess(userId, userEmail, eventId);

    const event = await prisma.events.findUnique({
      where: getEventWhereClause(userId, userEmail, eventId),
      include: {
        ticketTypes: {
          select: {
            name: true,
            price: true,
            quantity: true,
            description: true,
            maxPurchasePerUser: true,
            saleStartDate: true,
            saleEndDate: true,
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

  // Get user and verify authentication
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }
  const userId = user.uid;
  const userEmail = user.email;
  await verifyEventAccess(userId, userEmail, eventId);

  // Check user role for paid events capability
  const userRole = await prisma.users.findUnique({
    where: {
      email: user?.email,
    },
    select: {
      role: true,
    },
  });
  const paidEventsEnabled = userRole?.role === 'ORGANIZER';

  const event = await getEvent(eventId, userId, userEmail);

  if (!event) {
    notFound();
  }

  const initialData = {
    ...event,
    eventName: event?.name,
    startDate: event?.startDate,
    endDate: event?.endDate,
    venue: event?.venue ?? '',
    address: event?.address ?? '',
    country: event?.country ?? '',
    countryCode: event?.countryCode ?? '',
    latitude: event?.latitude ?? 0,
    longitude: event?.longitude ?? 0,
    imageUrl: event?.imageUrl ?? '',
    description: event?.description ?? '',
    organizer: event?.organizer ?? '',
  };

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
      />
    </div>
  );
}
