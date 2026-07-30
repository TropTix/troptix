/**
 * LEGACY — mobile-oriented reads for `apps/organizer-v2` only. Frozen: do not
 * extend. Ownership-only (the platform-owner bypass was removed, ADR 0018),
 * string errors the tRPC router matches on. Retired when v2 moves onto the
 * seam (docs/plans/2026-07-organizer-dashboard-migration.md); until then
 * Membership (ADR 0022) must land here and in organizer-checkin.ts.
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

  // Atomic check-then-flip is the only gate: only the request that finds the
  // ticket still un-checked flips it, so two simultaneous scans can't both
  // succeed. Un-checked means legacy AVAILABLE or the canonical VALID the
  // reservation checkout mints (the lifecycle enums are mid-cutover).
  const result = await prisma.tickets.updateMany({
    where: {
      id: ticketId,
      status: { in: ['AVAILABLE', 'VALID'] },
      checkinTimestamp: null,
    },
    data: {
      status: 'NOT_AVAILABLE',
      checkinTimestamp: new Date(),
    },
  });
  if (result.count === 0) {
    // A void ticket is not "already scanned" — telling door staff it was is
    // what gets a refunded holder waved through. The read may be stale, but a
    // stale un-checked status means we lost a race, which IS already-checked-in.
    throw new Error(
      ['USED', 'CANCELLED', 'REFUNDED'].includes(ticket.status)
        ? 'TICKET_NOT_VALID'
        : 'ALREADY_CHECKED_IN'
    );
  }

  return { success: true };
}
