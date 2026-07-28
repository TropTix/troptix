import React from 'react';
import { EventManagementNav } from '@/components/ui/event-management-nav';
import prisma from '@/server/prisma';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import type { ServerUser } from '@/server/authUser';

// Ownership IS the access check (ADR 0013/0019): the scoped read returns null
// for an event the caller doesn't own, and null is a 404. No separate guard,
// no platform-owner bypass — staff observe via View-as on the seam pages.
async function getEvent(eventId: string, user: ServerUser) {
  const event = await prisma.events.findUnique({
    where: { id: eventId, organizerUserId: user.uid },
    select: { name: true, isDraft: true },
  });
  if (!event) {
    notFound();
  }
  return event;
}

export default async function EventManagementLayout(props: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const params = await props.params;

  const { children } = props;

  // Get user and verify authentication
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  const event = await getEvent(params.eventId, user);

  return (
    <div>
      <EventManagementNav
        eventId={params.eventId}
        eventName={event.name}
        isDraft={event.isDraft}
      />
      <div className="mt-4 mx-auto">{children}</div>
    </div>
  );
}
