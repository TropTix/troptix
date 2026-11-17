import prisma from '@/server/prisma';
import type { ServerUser } from '@/server/authUser';
import { notFound } from 'next/navigation';

export type PlatformEventData = {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  venue: string | null;
  isDraft: boolean;
  status: 'Active' | 'Upcoming' | 'Past' | 'Draft';
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
  if (!user.isPlatformOwner) {
    notFound();
  }

  const [eventsRaw, orderTotals, ticketTotals] = await Promise.all([
    prisma.events.findMany({
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        venue: true,
        isDraft: true,

        // The canonical organizer (ADR 0022) — not the stale `organizer` name
        // snapshot on the event row, and not the legacy organizerUserId key.
        organization: {
          select: {
            displayName: true,
            owner: { select: { id: true, email: true } },
          },
        },
      },
      orderBy: [{ isDraft: 'asc' }, { startsAt: 'desc' }],
    }),
    prisma.orders.groupBy({
      by: ['eventId'],
      where: { status: 'COMPLETED' },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.tickets.groupBy({
      by: ['eventId'],
      where: { order: { status: 'COMPLETED' } },
      _count: { _all: true },
    }),
  ]);

  const ordersByEvent = new Map(
    orderTotals.map((row) => [
      row.eventId,
      { totalOrders: row._count._all, totalRevenue: row._sum.total ?? 0 },
    ])
  );
  const ticketsByEvent = new Map(
    ticketTotals.map((row) => [row.eventId, row._count._all])
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return eventsRaw.map((event) => {
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

    const orders = ordersByEvent.get(event.id);

    return {
      id: event.id,
      name: event.name,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      venue: event.venue,
      isDraft: event.isDraft,
      status,
      organizer: {
        id: event.organization.owner.id,
        name: event.organization.displayName,
        email: event.organization.owner.email,
      },
      stats: {
        totalOrders: orders?.totalOrders ?? 0,
        totalRevenue: orders?.totalRevenue ?? 0,
        ticketsSold: ticketsByEvent.get(event.id) ?? 0,
      },
    };
  });
}
