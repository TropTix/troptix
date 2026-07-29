import React from 'react';
import { EventManagementNav } from '@/components/ui/event-management-nav';
import prisma from '@/server/prisma';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import type { ServerUser } from '@/server/authUser';

// Ownership IS the access check (ADR 0013/0019): the scoped read returns null
// for an event the caller doesn't own, and null is a 404. Platform Owners pass
// this shell — a layout cannot read ?viewAs (layouts get no searchParams), and
// blocking here would kill View-as on every page below; the pages themselves
// authorize (seam reads honor viewAs, the rest are self-scoped and 404).
// All this shell exposes to staff is the nav's name/isDraft.
async function getEvent(eventId: string, user: ServerUser) {
  const event = await prisma.events.findUnique({
    where: {
      id: eventId,
      ...(user.isPlatformOwner ? {} : { organizerUserId: user.uid }),
    },
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
