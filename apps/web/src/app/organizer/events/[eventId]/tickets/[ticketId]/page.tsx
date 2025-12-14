import React from 'react';
import { notFound } from 'next/navigation';
import prisma from '@/server/prisma'; // Use correct prisma import
import { CreateTicketTypeForm } from '../new/_components/CreateTicketTypeForm';
import { BackButton } from '@/components/ui/back-button'; // Import the new button
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import { verifyEventAccess, getEventWhereClause } from '@/server/accessControl';

interface EditEventTicketPageProps {
  params: Promise<{
    eventId: string;
    ticketId: string; // Add ticketId to params
  }>;
}

async function getTicketTypeData(
  ticketId: string,
  eventId: string,
  userId: string,
  userEmail?: string
) {
  try {
    // Verify access to the event first
    await verifyEventAccess(userId, userEmail, eventId);

    const ticketType = await prisma.ticketTypes.findUniqueOrThrow({
      where: {
        id: ticketId,
        eventId: eventId, // Ensure ticket belongs to this event
        event: getEventWhereClause(userId, userEmail, eventId),
      },
      select: {
        id: true,
        name: true,
        discountCode: true,
        description: true,
        price: true,
        quantity: true,
        maxPurchasePerUser: true,
        saleStartDate: true,
        saleEndDate: true,
        ticketingFees: true,
      },
    });
    return ticketType;
  } catch (error) {
    console.error('Failed to fetch ticket type:', error);
    notFound();
  }
}

// Server component to render the edit form
export default async function EditEventTicketPage(props: EditEventTicketPageProps) {
  const params = await props.params;
  const { eventId, ticketId } = params;

  // Get user and verify authentication
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  const userRole = await prisma.users.findUnique({
    where: {
      email: user.email,
    },
    select: {
      role: true,
    },
  });
  const isOrganizer = userRole?.role === 'ORGANIZER';

  const ticketData = await getTicketTypeData(
    ticketId,
    eventId,
    user.uid,
    user.email
  );

  const initialFormData = {
    ...ticketData,
    saleStartDate: ticketData.saleStartDate,
    saleEndDate: ticketData.saleEndDate,
    description: ticketData.description ?? undefined,
    discountCode: ticketData.discountCode ?? undefined,
  };

  const backUrl = `/organizer/events/${eventId}/tickets`;

  return (
    <div className=" mx-auto py-8">
      <div className="mb-6 flex items-center gap-2">
        <BackButton href={backUrl} />
        <h1 className="text-2xl font-semibold ">Edit Ticket Type</h1>
      </div>

      <p className="text-muted-foreground mb-6">
        Update the details for the &apos;{ticketData.name}&apos; ticket type.
      </p>

      <div className="w-full lg:w-1/2 xl:w-2/3">
        <CreateTicketTypeForm
          eventId={eventId}
          initialData={initialFormData}
          isOrganizer={isOrganizer}
        />
      </div>
    </div>
  );
}
