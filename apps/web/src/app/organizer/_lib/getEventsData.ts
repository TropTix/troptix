import { Prisma } from '@/generated/prisma/client';

import prisma from '@/server/prisma';

// Define type for the fetched and processed event data
export type EventCardData = {
  id: string;
  name: string;
  startDate: Date; // Keep as Date object for easier comparison
  startTime: Date | null; // Keep as Date object
  endDate: Date; // Keep as Date object
  venue: string | null;
  description: string | null; // Keep full description, limit with CSS
  imageUrl: string | null;
  isDraft: boolean;
  // Derived status
  status: 'Active' | 'Upcoming' | 'Past' | 'Draft';
};

// Define the type for the grouped events
type GroupedEvents = {
  [key in EventCardData['status']]?: EventCardData[]; // Optional arrays for each status
};

export const getAllOrganizerEvents = async (
  organizerUserId: string
): Promise<GroupedEvents> => {
  const eventsRaw = await prisma.events.findMany({
    where: { organizerUserId: organizerUserId },
    select: {
      id: true,
      name: true,
      startDate: true,
      startTime: true,
      endDate: true, // Needed for status calculation
      venue: true,
      description: true,
      imageUrl: true,
      isDraft: true,
    },
    // Initial sort is less critical now as we sort after grouping
    // orderBy: {
    //   startDate: 'desc',
    // },
  });
  console.log('eventsRaw', eventsRaw);

  // Process raw data to derive status
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day for date comparisons

  const processedEvents = eventsRaw.map((event): EventCardData => {
    let status: EventCardData['status'];

    if (event.isDraft) {
      status = 'Draft';
    } else if (new Date(event.endDate) < today) {
      status = 'Past';
    } else if (new Date(event.startDate) <= today) {
      // Starts today or earlier, ends today or later
      status = 'Active';
    } else {
      // Starts in the future
      status = 'Upcoming';
    }

    return {
      ...event,
      status: status,
      // Ensure description and venue are handled if null
      description: event.description ?? 'No description available.',
      venue: event.venue ?? 'Venue not specified',
    };
  });

  // Group events by status
  const grouped: GroupedEvents = {};
  processedEvents.forEach((event) => {
    if (!grouped[event.status]) {
      grouped[event.status] = [];
    }
    grouped[event.status]?.push(event);
  });

  // Sort within groups
  // Upcoming: Soonest first
  grouped.Upcoming?.sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  );
  // Active, Past, Draft: Most recent start date first
  grouped.Active?.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  grouped.Past?.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  grouped.Draft?.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

  return grouped;
};
