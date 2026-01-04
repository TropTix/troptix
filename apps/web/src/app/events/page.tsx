import { Prisma } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import prisma from '@/server/prisma';
import { Calendar, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import EventCard from './_components/EventCard';

export const revalidate = 86400; // 24 hours in seconds

const EventSelect = {
  id: true,
  name: true,
  description: true,
  startDate: true,
  endDate: true,
  imageUrl: true,
  venue: true,
  ticketTypes: {
    select: {
      price: true,
    },
    where: {
      OR: [
        {
          discountCode: { equals: null },
        },
        {
          discountCode: { equals: '' },
        },
      ],
    },
    orderBy: {
      price: Prisma.SortOrder.asc,
    },
    take: 1,
  },
};

export type Event = Prisma.EventsGetPayload<{
  select: typeof EventSelect;
}>;

async function fetchEvents(): Promise<Event[]> {
  const events = await prisma.events.findMany({
    select: EventSelect,
    where: {
      isDraft: false,
      endDate: { gt: new Date() },
    },
    orderBy: {
      startDate: Prisma.SortOrder.desc,
    },
  });

  return events;
}

export default async function EventsPage() {
  const events = await fetchEvents();

  return (
    <div className="flex min-h-screen flex-col">
      <div className="grow w-full max-w-7xl mx-auto px-4 py-8">
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
            Events
          </h1>
        </div>

        {events.length === 0 ? (
          <Card className="max-w-md mx-auto text-center">
            <CardContent className="pt-8 pb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                No events available
              </h3>
              <p className="text-muted-foreground mb-6">
                There are no upcoming events at the moment. Check back soon for
                new events!
              </p>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/">
                  Back to Home
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
