// Capacity may deliberately be edited below `sold` — it stops further sales
// and corrupts nothing, so no guard belongs here.
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  ticketTypeInputSchema,
  type TicketTypeInput,
} from '../contracts/organizer';
import { NotFoundError } from './_shared/errors';
import { requireOwnedEvent } from './_shared/owned-event';
import { generateId } from './_shared/ids';
import { toCents } from './_shared/organizerMapping';
import { assertPaidTicketingAllowed } from './_shared/paid-ticketing';
import { ticketTypeWriteFields } from './_shared/ticket-type-fields';
import { resolveOrganizerScope } from './organizer-scope';
import { findOrganizationForOwner } from './organizations';

export async function createTicketType(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  input: TicketTypeInput
): Promise<{ ticketTypeId: string }> {
  const data = ticketTypeInputSchema.parse(input);
  const organizerUserId = await resolveOrganizerScope(prisma, actor);

  const [, org] = await Promise.all([
    requireOwnedEvent(prisma, organizerUserId, eventId),
    findOrganizationForOwner(prisma, organizerUserId),
  ]);
  assertPaidTicketingAllowed(
    { paidTicketingEnabled: org?.paidTicketingEnabled ?? false },
    [data]
  );

  const ticketTypeId = generateId();
  await prisma.ticketTypes.create({
    data: { id: ticketTypeId, eventId, ...ticketTypeWriteFields(data) },
  });

  return { ticketTypeId };
}

export async function updateTicketType(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  ticketTypeId: string,
  input: TicketTypeInput
): Promise<void> {
  const data = ticketTypeInputSchema.parse(input);
  const organizerUserId = await resolveOrganizerScope(prisma, actor);

  const [owned, org] = await Promise.all([
    prisma.ticketTypes.findFirst({
      where: {
        id: ticketTypeId,
        eventId,
        event: { organizerUserId, deletedAt: null },
      },
      select: { id: true, price: true, priceCents: true },
    }),
    findOrganizationForOwner(prisma, organizerUserId),
  ]);
  if (!owned) {
    throw new NotFoundError('Ticket type not found');
  }
  // Only the free → paid transition is gated: a row already paid stays
  // editable even if the org lost — or never had — approval.
  const storedPriceCents = owned.priceCents ?? toCents(owned.price);
  if (storedPriceCents === 0) {
    assertPaidTicketingAllowed(
      { paidTicketingEnabled: org?.paidTicketingEnabled ?? false },
      [data]
    );
  }

  await prisma.ticketTypes.update({
    where: { id: ticketTypeId },
    data: ticketTypeWriteFields(data),
  });
}
