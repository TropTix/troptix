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

const PLATFORM_OWNER_EMAIL_SUFFIX = '@usetroptix.com';

// App Store review's fixed account. Every other @usetroptix.com admin keeps
// unrestricted platform-owner access; this one is scoped down to admin-owned
// events only so a reviewer never sees real organizers' live data.
const REVIEW_ACCOUNT_EMAIL = 'test@usetroptix.com';

/**
 * Ensures the actor has organizer privileges. Returns the events scope this
 * actor may access:
 *   - a regular organizer: only their own events (`organizerIds: [userId]`)
 *   - a platform-owner (@usetroptix.com) account: every event, unrestricted
 *     (`allEvents: true`) — unchanged legacy behavior
 *   - the App Store review account specifically: only events owned by
 *     platform-owner accounts (`organizerIds: [...admin userIds]`), so it
 *     never sees a real organizer's live data
 */
async function authorizeOrganizer(prisma: PrismaClient, actor: Actor) {
  if (actor.kind !== 'user') {
    throw new Error('UNAUTHORIZED');
  }

  const user = await prisma.users.findUnique({
    where: { id: actor.userId },
    select: { email: true },
  });

  const isPlatformOwner =
    user?.email?.endsWith(PLATFORM_OWNER_EMAIL_SUFFIX) ?? false;

  if (!isPlatformOwner) {
    return { allEvents: false, organizerIds: [actor.userId] };
  }

  if (user?.email !== REVIEW_ACCOUNT_EMAIL) {
    return { allEvents: true, organizerIds: [] };
  }

  const admins = await prisma.users.findMany({
    where: { email: { endsWith: PLATFORM_OWNER_EMAIL_SUFFIX } },
    select: { id: true },
  });

  return { allEvents: false, organizerIds: admins.map((a) => a.id) };
}

export async function getEvents(prisma: PrismaClient, actor: Actor) {
  const { allEvents, organizerIds } = await authorizeOrganizer(prisma, actor);

  const events = await prisma.events.findMany({
    where: allEvents ? {} : { organizerUserId: { in: organizerIds } },
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
  const { allEvents, organizerIds } = await authorizeOrganizer(prisma, actor);

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

  if (!allEvents && !organizerIds.includes(event.organizerUserId)) {
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
      email: t.email ?? undefined,
    })),
  };
}

export async function checkInTicket(
  prisma: PrismaClient,
  actor: Actor,
  ticketId: string
) {
  const { allEvents, organizerIds } = await authorizeOrganizer(prisma, actor);

  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    include: { event: true },
  });

  if (!ticket) {
    throw new Error('NOT_FOUND');
  }

  if (!allEvents && !organizerIds.includes(ticket.event.organizerUserId)) {
    throw new Error('UNAUTHORIZED');
  }

  if (ticket.checkinTimestamp) {
    throw new Error('ALREADY_CHECKED_IN');
  }

  await prisma.tickets.update({
    where: { id: ticketId },
    data: {
      checkinTimestamp: new Date(),
    },
  });

  return { success: true };
}

export async function undoCheckinTicket(
  prisma: PrismaClient,
  actor: Actor,
  ticketId: string
) {
  const { allEvents, organizerIds } = await authorizeOrganizer(prisma, actor);

  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    include: { event: true },
  });

  if (!ticket) {
    throw new Error('NOT_FOUND');
  }

  if (!allEvents && !organizerIds.includes(ticket.event.organizerUserId)) {
    throw new Error('UNAUTHORIZED');
  }

  if (!ticket.checkinTimestamp) {
    throw new Error('NOT_CHECKED_IN');
  }

  await prisma.tickets.update({
    where: { id: ticketId },
    data: {
      checkinTimestamp: null,
    },
  });

  return { success: true };
}
