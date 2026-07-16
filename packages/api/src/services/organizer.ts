/**
 * LEGACY — the mobile-oriented reads for `apps/organizer-v2` only. Frozen: do
 * not extend, and do not copy `authorizeOrganizer` into new code.
 *
 * The web organizer surface uses `organizer-scope.ts` +
 * `organizer-dashboard.ts` instead. This file still carries the
 * `isPlatformOwner ? {} : { organizerUserId }` cross-organizer bypass that
 * ADR 0018 removes, and throws string errors the tRPC router matches on rather
 * than the typed errors in `_shared/errors.ts`. Both are retired when v2 moves
 * onto the new seam (see docs/plans/2026-07-organizer-dashboard-migration.md).
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';

/**
 * Ensures the actor has organizer privileges.
 * Returns whether the actor is a platform owner (@usetroptix.com email)
 * and their userId.
 */
async function authorizeOrganizer(prisma: PrismaClient, actor: Actor) {
  if (actor.kind !== 'user') {
    throw new Error('UNAUTHORIZED');
  }

  const user = await prisma.users.findUnique({
    where: { id: actor.userId },
    select: { email: true },
  });

  const isPlatformOwner = user?.email?.endsWith('@usetroptix.com') ?? false;

  return { userId: actor.userId, isPlatformOwner };
}

export async function getEvents(prisma: PrismaClient, actor: Actor) {
  const { userId, isPlatformOwner } = await authorizeOrganizer(prisma, actor);

  const events = await prisma.events.findMany({
    where: isPlatformOwner ? {} : { organizerUserId: userId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
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
    orderBy: { startDate: 'desc' },
  });

  return events.map((e) => ({
    id: e.id,
    name: e.name,
    startDate: e.startDate,
    endDate: e.endDate,
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
  const { userId, isPlatformOwner } = await authorizeOrganizer(prisma, actor);

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

  // Authorization: if not platform owner, ensure they own the event
  if (!isPlatformOwner && event.organizerUserId !== userId) {
    throw new Error('UNAUTHORIZED');
  }

  return {
    id: event.id,
    name: event.name,
    date: event.startDate,
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
