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
import { requireOwnedEvent } from './_shared/owned-event';
import { assertPaidTicketingAllowed } from './_shared/paid-ticketing';
import { ticketTypeWriteFields } from './_shared/ticket-type-fields';
import { resolveOrganizerScope } from './organizer-scope';
import {
  ensureOrganizationForUser,
  findOrganizationForOwner,
} from './organizations';

export async function createEvent(
  prisma: PrismaClient,
  actor: Actor,
  input: CreateEventInput
): Promise<{ eventId: string }> {
  const data = createEventInputSchema.parse(input);
  const organizerUserId = await resolveOrganizerScope(prisma, actor);

  const org = await resolveOrganization(prisma, organizerUserId);
  const ticketTypes = data.ticketTypes ?? [];
  assertPaidTicketingAllowed(org, ticketTypes);

  const eventId = generateId();

  await prisma.$transaction(async (tx) => {
    await tx.events.create({
      data: {
        id: eventId,
        organizerUserId,
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
  const organizerUserId = await resolveOrganizerScope(prisma, actor);

  // Provisioning (a write) must wait until ownership has passed, so probing a
  // foreign event id can't leave side effects.
  const [, existingOrg] = await Promise.all([
    requireOwnedEvent(prisma, organizerUserId, eventId),
    findOrganizationForOwner(prisma, organizerUserId),
  ]);
  const org =
    existingOrg ?? (await provisionOrganization(prisma, organizerUserId));

  await prisma.events.update({
    where: { id: eventId },
    data: {
      organizationId: org.id,
      organizer: org.displayName,
      ...eventFields(data),
    },
  });

  return { organizationSlug: org.slug };
}

async function resolveOrganization(
  prisma: PrismaClient,
  organizerUserId: string
) {
  const existing = await findOrganizationForOwner(prisma, organizerUserId);
  return existing ?? provisionOrganization(prisma, organizerUserId);
}

async function provisionOrganization(
  prisma: PrismaClient,
  organizerUserId: string
) {
  const user = await prisma.users.findUnique({
    where: { id: organizerUserId },
    select: { email: true },
  });
  return ensureOrganizationForUser(prisma, {
    ownerUserId: organizerUserId,
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
