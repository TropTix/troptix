/**
 * LEGACY — the mobile-oriented reads for `apps/organizer-v2` only. Frozen: do
 * not extend.
 *
 * The web organizer surface uses `organizer-scope.ts` +
 * `organizer-dashboard.ts` instead. Access here is ownership-only — the old
 * `isPlatformOwner ? {} : { organizerUserId }` cross-organizer bypass was
 * removed per ADR 0018 (writes never carry platform-owner power, and admin
 * reads go through View-as on the web seam). Still throws string errors the
 * tRPC router matches on rather than the typed errors in `_shared/errors.ts`;
 * retired when v2 moves onto the new seam (see
 * docs/plans/2026-07-organizer-dashboard-migration.md).
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';

function requireUserId(actor: Actor): string {
  if (actor.kind !== 'user') {
    throw new Error('UNAUTHORIZED');
  }
  return actor.userId;
}

export async function getEvents(prisma: PrismaClient, actor: Actor) {
  const userId = requireUserId(actor);

  const events = await prisma.events.findMany({
    where: { organizerUserId: userId },
    select: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
      venue: true,
      address: true,
      imageUrl: true,
      isDraft: true,
      _count: {
        select: {
          tickets: {
            where: { order: { status: 'COMPLETED' } },
          },
        },
      },
    },
    orderBy: { startsAt: 'desc' },
  });

  return events.map((e) => ({
    id: e.id,
    name: e.name,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    venue: e.venue ?? '',
    address: e.address,
    imageUrl: e.imageUrl ?? null,
    isDraft: e.isDraft,
    ticketsSold: e._count.tickets,
  }));
}

export async function getEvent(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string
) {
  const userId = requireUserId(actor);

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    include: {
      tickets: {
        where: { order: { status: 'COMPLETED' } },
        include: { ticketType: true },
      },
    },
  });

  if (!event) {
    throw new Error('NOT_FOUND');
  }

  if (event.organizerUserId !== userId) {
    throw new Error('UNAUTHORIZED');
  }

  return {
    id: event.id,
    name: event.name,
    date: event.startsAt,
    venue: event.venue ?? '',
    city: event.address?.split(',')[1]?.trim() ?? '', // Simple fallback for city
    guests: event.tickets.map((t) => ({
      id: t.id,
      name:
        `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim() || 'Unknown Guest',
      ticketType: t.ticketType?.name ?? (t.ticketsType as string) ?? 'General',
      ticketId: t.id,
      checkedIn: !!t.checkinTimestamp,
      checkedInAt: t.checkinTimestamp?.toISOString(),
    })),
  };
}

export async function checkInTicket(
  prisma: PrismaClient,
  actor: Actor,
  ticketId: string
) {
  const userId = requireUserId(actor);

  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    include: { event: true },
  });

  if (!ticket) {
    throw new Error('NOT_FOUND');
  }

  if (ticket.event.organizerUserId !== userId) {
    throw new Error('UNAUTHORIZED');
  }

  if (ticket.status === 'NOT_AVAILABLE' || ticket.checkinTimestamp) {
    throw new Error('ALREADY_CHECKED_IN');
  }

  await prisma.tickets.update({
    where: { id: ticketId },
    data: {
      status: 'NOT_AVAILABLE',
      checkinTimestamp: new Date(),
    },
  });

  return { success: true };
}
