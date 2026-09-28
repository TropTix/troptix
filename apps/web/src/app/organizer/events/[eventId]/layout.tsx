import React from 'react';
import { EventManagementNav } from '@/components/ui/event-management-nav';
import prisma from '@/server/prisma';
import { Capability, eventsWhereCan } from '@troptix/api/server';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
import type { ServerUser } from '@/server/authUser';

// Platform Owners pass this nav shell: layouts can't read ?viewAs, and blocking
// here would kill View-as on every page below — the pages themselves authorize.
async function getEvent(eventId: string, user: ServerUser) {
  const event = await prisma.events.findFirst({
    where: {
      id: eventId,
      deletedAt: null,
      ...(user.isPlatformOwner
        ? {}
        : eventsWhereCan(user.uid, Capability.EventOrders)),
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
