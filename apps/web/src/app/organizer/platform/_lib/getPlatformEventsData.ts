import prisma from '@/server/prisma';
import type { ServerUser } from '@/server/authUser';
import { notFound } from 'next/navigation';

export type PlatformEventData = {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  venue: string | null;
  description: string | null;
  imageUrl: string | null;
  isDraft: boolean;
  status: 'Active' | 'Upcoming' | 'Past' | 'Draft';
  createdAt: Date;
  organizer: {
    id: string;
    name: string;
    email: string;
  };
  stats: {
    totalOrders: number;
    totalRevenue: number;
    ticketsSold: number;
  };
};

export async function getAllPlatformEvents(
  user: ServerUser
): Promise<PlatformEventData[]> {
  // The Platform View gate — one of the two doors the explicit grant opens
  // (the other is View-as in the service seam, ADR 0018/0022).
  if (!user.isPlatformOwner) {
    notFound();
  }

  const eventsRaw = await prisma.events.findMany({
    select: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
      venue: true,
      description: true,
      imageUrl: true,
      isDraft: true,
      createdAt: true,

      // The canonical organizer (ADR 0022) — not the stale `organizer` name
      // snapshot on the event row, and not the legacy organizerUserId key.
      organization: {
        select: {
          displayName: true,
          owner: { select: { id: true, email: true } },
        },
      },

      orders: {
        where: { status: 'COMPLETED' },
        select: {
          total: true,
          _count: { select: { tickets: true } },
        },
      },
    },
    orderBy: [
      { isDraft: 'asc' }, // Non-drafts first
      { startsAt: 'desc' },
    ],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const processedEvents: PlatformEventData[] = eventsRaw.map((event) => {
    let status: PlatformEventData['status'];
    if (event.isDraft) {
      status = 'Draft';
    } else if (new Date(event.endsAt) < today) {
      status = 'Past';
    } else if (new Date(event.startsAt) <= today) {
      status = 'Active';
    } else {
      status = 'Upcoming';
    }

    const totalRevenue = event.orders.reduce(
      (sum, order) => sum + order.total,
      0
    );
    const ticketsSold = event.orders.reduce(
      (sum, order) => sum + order._count.tickets,
      0
    );

    return {
      id: event.id,
      name: event.name,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      venue: event.venue,
      description: event.description,
      imageUrl: event.imageUrl,
      isDraft: event.isDraft,
      status,
      createdAt: event.createdAt,
      organizer: {
        id: event.organization.owner.id,
        name: event.organization.displayName,
        email: event.organization.owner.email,
      },
      stats: {
        totalOrders: event.orders.length,
        totalRevenue,
        ticketsSold,
      },
    };
  });

  return processedEvents;
}
