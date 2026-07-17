import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { listOrganizerEvents } from '@troptix/api/server';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { EventsList } from './_components/EventsList';

export default async function OrganizerEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }

  const { viewAs } = await searchParams;
  const events = await listOrganizerEvents(prisma, userToActor(user), {
    viewAsOrganizerUserId: viewAs,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Events</h1>
        <Button asChild>
          <Link href="/organizer/events/new">
            <Plus className="mr-2 h-4 w-4" />
            Create event
          </Link>
        </Button>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div>
              <p className="font-medium">No events yet</p>
              <p className="text-sm text-muted-foreground">
                Create an event to start selling tickets.
              </p>
            </div>
            <Button asChild>
              <Link href="/organizer/events/new">Create your first event</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <EventsList events={events} />
      )}
    </div>
  );
}
