/**
 * Screen E — the ticket-type write seam (#452, same shape as the event
 * writes). Create and edit a ticket type, pure over an injected `prisma`,
 * authorized on the `Actor` with the owning event as the boundary; writes
 * never take a View-as target (ADR 0018).
 *
 * The paid gate reads the actor's Organization (unapproved or missing org ⇒
 * free tickets only) through the same `assertPaidTicketingAllowed` the event
 * writes use. Deliberately unguarded, matching today: capacity may be edited
 * below `sold` (stops further sales, corrupts nothing — availability is
 * capacity − reserved − sold).
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  ticketTypeInputSchema,
  type TicketTypeInput,
} from '../contracts/organizer';
import { NotFoundError } from './_shared/errors';
import { generateId } from './_shared/ids';
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

  const [event, org] = await Promise.all([
    prisma.events.findFirst({
      where: { id: eventId, organizerUserId, deletedAt: null },
      select: { id: true },
    }),
    findOrganizationForOwner(prisma, organizerUserId),
  ]);
  if (!event) {
    throw new NotFoundError('Event not found');
  }
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
      select: { id: true },
    }),
    findOrganizationForOwner(prisma, organizerUserId),
  ]);
  if (!owned) {
    throw new NotFoundError('Ticket type not found');
  }
  assertPaidTicketingAllowed(
    { paidTicketingEnabled: org?.paidTicketingEnabled ?? false },
    [data]
  );

  await prisma.ticketTypes.update({
    where: { id: ticketTypeId },
    data: ticketTypeWriteFields(data),
  });
}
