/**
 * Screen D — the event write seam (docs/plans/2026-07-screen-d-event-form.md).
 *
 * Create and edit an event, pure over an injected `prisma`, authorized on the
 * `Actor` (ADR 0013) with ownership as the boundary. Writes never take a
 * View-as target (ADR 0018).
 *
 * `createEvent` is transactional over the event and its initial ticket types.
 * `updateEvent` touches event fields only — ticket-type editing is Screen E's
 * seam (#452, decided in #465). Both paths pass ticket-bearing input through
 * `assertPaidTicketingAllowed`, the one home of the paid-ticketing gate.
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  createEventInputSchema,
  updateEventInputSchema,
  type CreateEventInput,
  type UpdateEventInput,
} from '../contracts/organizer';
import { NotFoundError } from './_shared/errors';
import { generateId } from './_shared/ids';
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
): Promise<void> {
  const data = updateEventInputSchema.parse(input);
  const organizerUserId = await resolveOrganizerScope(prisma, actor);

  // Ownership check and the org lookup are independent reads — one wave.
  // Provisioning (a write) waits until ownership has passed, so probing a
  // foreign event id can't leave side effects.
  const [owned, existingOrg] = await Promise.all([
    prisma.events.findFirst({
      where: { id: eventId, organizerUserId, deletedAt: null },
      select: { id: true },
    }),
    findOrganizationForOwner(prisma, organizerUserId),
  ]);
  if (!owned) {
    throw new NotFoundError('Event not found');
  }
  // Keep the event pointed at the organizer's Organization + name mirror.
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
}

/**
 * The organizer's Organization (auto-created on first write). The email
 * lookup only seeds the display name at that one first creation, so it is
 * only paid when no org exists yet — every later save is a single read.
 */
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
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    venue: data.venue,
    address: data.address,
    country: data.country,
    countryCode: data.countryCode,
    latitude: data.latitude,
    longitude: data.longitude,
    imageUrl: data.imageUrl,
  };
}
