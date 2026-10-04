import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  OrganizerEventSummary,
  ViewAsInput,
} from '../contracts/organizer';
import { eventCardSelect, toEventSummary } from './_shared/organizerReads';
import { isPlatformOwner, resolveOrganizerScope } from './organizer-scope';

export async function listOrganizerEvents(
  prisma: PrismaClient,
  actor: Actor,
  input: ViewAsInput = {},
  now: Date = new Date()
): Promise<OrganizerEventSummary[]> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );

  const rows = await prisma.events.findMany({
    where: { organizerUserId, deletedAt: null },
    select: eventCardSelect,
    orderBy: { startsAt: 'desc' },
  });

  return rows.map((event) => toEventSummary(event, now));
}

export async function getEventNavSummary(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string
) {
  const userId = await resolveOrganizerScope(prisma, actor);
  const ownership = (await isPlatformOwner(prisma, userId))
    ? {}
    : { organizerUserId: userId };
  return prisma.events.findUnique({
    where: { id: eventId, deletedAt: null, ...ownership },
    select: { name: true, isDraft: true },
  });
}

export async function getEventName(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string
) {
  const organizerUserId = await resolveOrganizerScope(prisma, actor);
  return prisma.events.findUnique({
    where: { id: eventId, organizerUserId, deletedAt: null },
    select: { name: true },
  });
}

export async function getEventForEdit(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string
) {
  const organizerUserId = await resolveOrganizerScope(prisma, actor);
  const [event, organization] = await Promise.all([
    prisma.events.findUnique({
      where: { id: eventId, organizerUserId, deletedAt: null },
      include: {
        ticketTypes: {
          select: {
            name: true,
            price: true,
            capacity: true,
            description: true,
            maxPurchasePerUser: true,
            saleStartsAt: true,
            saleEndsAt: true,
            ticketingFees: true,
            discountCode: true,
          },
        },
      },
    }),
    prisma.organization.findFirst({
      where: { ownerUserId: organizerUserId },
      select: { displayName: true, paidTicketingEnabled: true },
    }),
  ]);
  return { event, organization };
}

export async function listEventAttendees(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string
) {
  const organizerUserId = await resolveOrganizerScope(prisma, actor);
  return prisma.tickets.findMany({
    where: {
      eventId,
      event: { organizerUserId, deletedAt: null },
      order: { status: 'COMPLETED' },
    },
    select: {
      id: true,
      createdAt: true,
      status: true,
      checkinTimestamp: true,
      email: true,
      firstName: true,
      lastName: true,
      ticketType: { select: { name: true } },
      order: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
