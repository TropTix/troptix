import React from 'react';
import { EventManagementNav } from '@/components/ui/event-management-nav';
import prisma from '@/server/prisma';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import { verifyEventAccess, getEventWhereClause } from '@/server/accessControl';

async function getEvent(eventId: string, userId: string, userEmail?: string) {
  // Verify access first
  await verifyEventAccess(userId, userEmail, eventId);
  
  const event = await prisma.events.findUnique({
    where: getEventWhereClause(userId, userEmail, eventId),
    select: { name: true, isDraft: true },
  });
  if (!event) {
    notFound();
  }
  return event;
}

export default async function EventManagementLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ eventId: string }>;
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  // Get user and verify authentication
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  const event = await getEvent(params.eventId, user.uid, user.email);

  return (
    <div>
      <EventManagementNav eventId={params.eventId} eventName={event.name} isDraft={event.isDraft} />
      <div className="mt-4 mx-auto">{children}</div>
    </div>
  );
}
