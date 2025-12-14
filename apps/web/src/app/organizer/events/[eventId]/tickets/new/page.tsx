import React from 'react';
import { CreateTicketTypeForm } from './_components/CreateTicketTypeForm';
import { BackButton } from '@/components/ui/back-button';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import { verifyEventAccess } from '@/server/accessControl';
import prisma from '@/server/prisma';

interface CreateEventTicketPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function CreateEventTicketPage(props: CreateEventTicketPageProps) {
  const params = await props.params;
  const { eventId } = params;

  // Get user and verify authentication
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  // Verify access to this event
  await verifyEventAccess(user.uid, user.email, eventId);
  const userRole = await prisma.users.findUnique({
    where: {
      email: user.email,
    },
    select: {
      role: true,
    },
  });
  const isOrganizer = userRole?.role === 'ORGANIZER';

  return (
    <div className="mx-auto py-8">
      <div className="mb-6 flex items-center gap-2">
        <BackButton />
        <h1 className="text-2xl font-semibold">Create Ticket</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Define the details for a new ticket for your event.
      </p>

      <div className="w-full lg:w-1/2 xl:w-2/3">
        <CreateTicketTypeForm eventId={eventId} isOrganizer={isOrganizer} />
      </div>
    </div>
  );
}
