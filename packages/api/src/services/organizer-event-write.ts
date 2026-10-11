// `updateEvent` touches event fields only — ticket-type editing belongs to
// the ticket-type write seam, not here.
import type { PrismaClient } from '@troptix/db';
import { Prisma } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  createEventInputSchema,
  updateEventInputSchema,
  type CreateEventInput,
  type UpdateEventInput,
} from '../contracts/organizer';
import { generateId } from './_shared/ids';
import { NotFoundError } from './_shared/errors';
import { assertPaidTicketingAllowed } from './_shared/paid-ticketing';
import { ticketTypeWriteFields } from './_shared/ticket-type-fields';
import {
  eventsInScope,
  resolveOrganizerScope,
  type OrganizerScope,
} from './organizer-scope';
import { ensureOrganizationForUser } from './organizations';

export async function createEvent(
  prisma: PrismaClient,
  actor: Actor,
  input: CreateEventInput
): Promise<{ eventId: string }> {
  const data = createEventInputSchema.parse(input);
  const scope = await resolveOrganizerScope(prisma, actor);

  const org = await resolveOrganization(prisma, scope);
  const ticketTypes = data.ticketTypes ?? [];
  assertPaidTicketingAllowed(org, ticketTypes);

  const eventId = generateId();

  await prisma.$transaction(async (tx) => {
    await tx.events.create({
      data: {
        id: eventId,
        organizerUserId: scope.userId,
        organizationId: org.id,
        isDraft: true,
        organizer: org.displayName,
        ...eventFields(data),
      },
    });

    if (ticketTypes.length > 0) {
      await tx.ticketTypes.createMany({
        data: ticketTypes.map((ticketType) => ({
          id: generateId(),
          eventId,
          ...ticketTypeWriteFields(ticketType),
        })),
      });
    }
  });

  return { eventId };
}

export async function updateEvent(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  input: UpdateEventInput
): Promise<{ organizationSlug: string }> {
  const data = updateEventInputSchema.parse(input);
  const scope = await resolveOrganizerScope(prisma, actor);

  const event = await prisma.events.findFirst({
    where: { id: eventId, ...eventsInScope(scope) },
    select: { organization: { select: { slug: true, displayName: true } } },
  });
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  await prisma.events.update({
    where: { id: eventId },
    data: { organizer: event.organization.displayName, ...eventFields(data) },
  });

  return { organizationSlug: event.organization.slug };
}

async function resolveOrganization(
  prisma: PrismaClient,
  scope: OrganizerScope
) {
  if (scope.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: scope.organizationId },
    });
    if (org) return org;
  }
  const user = await prisma.users.findUnique({
    where: { id: scope.userId },
    select: { email: true },
  });
  return ensureOrganizationForUser(prisma, {
    ownerUserId: scope.userId,
    displayName: user?.email ?? '',
  });
}

function eventFields(data: UpdateEventInput) {
  return {
    name: data.name,
    description: data.description ?? '',
    isPrivate: data.isPrivate,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    venue: data.venue,
    address: data.address,
    country: data.country,
    countryCode: data.countryCode,
    latitude: data.latitude,
    longitude: data.longitude,
    imageUrl: data.imageUrl,
    pageTheme: data.pageTheme,
    // Omitted (undefined) leaves the stored palette untouched; an explicit
    // null clears it (flyer removed) — Prisma needs DbNull for that.
    flyerPalette:
      data.flyerPalette === undefined
        ? undefined
        : (data.flyerPalette ?? Prisma.DbNull),
  };
}
