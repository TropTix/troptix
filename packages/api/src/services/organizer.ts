/**
 * LEGACY — the mobile-oriented reads for `apps/organizer-v2` only. Frozen: do
 * not extend, and do not copy `authorizeOrganizer` into new code.
 *
 * The web organizer surface uses `organizer-scope.ts` +
 * `organizer-dashboard.ts` instead, which handle the platform-owner bypass
 * via an explicit View-as target (ADR 0018) rather than the implicit
 * "@usetroptix.com sees admin-owned events" scoping here. This file still
 * throws string errors the tRPC router matches on rather than the typed
 * errors in `_shared/errors.ts`. Both are retired when v2 moves onto the new
 * seam (see docs/plans/2026-07-organizer-dashboard-migration.md).
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';

export async function getEvents(prisma: PrismaClient, actor: Actor) {
  if (actor.kind !== 'user') {
    throw new Error('UNAUTHORIZED');
  }

  const events = await prisma.events.findMany({
    where: { organizerUserId: actor.userId },
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
  if (actor.kind !== 'user') {
    throw new Error('UNAUTHORIZED');
  }

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

  if (event.organizerUserId !== actor.userId) {
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
      ticketType: t.ticketType?.name ?? t.ticketsType ?? 'General',
      ticketId: t.id,
      checkedIn: !!t.checkinTimestamp,
      checkedInAt: t.checkinTimestamp?.toISOString(),
      email: t.email ?? undefined,
    })),
  };
}

export async function checkInTicket(
  prisma: PrismaClient,
  actor: Actor,
  ticketId: string
) {
  if (actor.kind !== 'user') {
    throw new Error('UNAUTHORIZED');
  }

  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    select: { status: true, event: { select: { organizerUserId: true } } },
  });

  if (!ticket) {
    throw new Error('NOT_FOUND');
  }

  // Ownership-only: writes never carry platform-owner power (ADR 0018).
  if (ticket.event.organizerUserId !== actor.userId) {
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
      checkinTimestamp: new Date(),
    },
  });
  if (result.count === 0) {
    // A void ticket is not "already scanned" — telling door staff it was is
    // what gets a refunded holder waved through.
    throw new Error(
      ['USED', 'CANCELLED', 'REFUNDED'].includes(ticket.status)
        ? 'TICKET_NOT_VALID'
        : 'ALREADY_CHECKED_IN'
    );
  }

  return { success: true };
}

export async function undoCheckInTicket(
  prisma: PrismaClient,
  actor: Actor,
  ticketId: string
) {
  if (actor.kind !== 'user') {
    throw new Error('UNAUTHORIZED');
  }

  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    select: { status: true, event: { select: { organizerUserId: true } } },
  });

  if (!ticket) {
    throw new Error('NOT_FOUND');
  }

  if (ticket.event.organizerUserId !== actor.userId) {
    throw new Error('UNAUTHORIZED');
  }

  const result = await prisma.tickets.updateMany({
    where: {
      id: ticketId,
      checkinTimestamp: { not: null },
    },
    data: {
      checkinTimestamp: null,
    },
  });

  if (result.count === 0) {
    throw new Error('NOT_CHECKED_IN');
  }

  return { success: true };
}
