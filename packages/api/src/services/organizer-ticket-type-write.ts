// Capacity may deliberately be edited below `sold` — it stops further sales
// and corrupts nothing, so no guard belongs here.
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  ticketTypeInputSchema,
  type TicketTypeInput,
} from '../contracts/organizer';
import { NotFoundError } from './_shared/errors';
import { Capability, eventsWhereCan } from './_shared/access';
import { generateId } from './_shared/ids';
import { toCents } from './_shared/organizerMapping';
import { assertPaidTicketingAllowed } from './_shared/paid-ticketing';
import { ticketTypeWriteFields } from './_shared/ticket-type-fields';
import { resolveOrganizerScope } from './organizer-scope';

const eventOrganizationSelect = {
  organization: { select: { paidTicketingEnabled: true } },
} as const;

export async function createTicketType(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  input: TicketTypeInput
): Promise<{ ticketTypeId: string }> {
  const data = ticketTypeInputSchema.parse(input);
  const userId = await resolveOrganizerScope(prisma, actor);

  const event = await prisma.events.findFirst({
    where: { id: eventId, ...eventsWhereCan(userId, Capability.EventEdit) },
    select: eventOrganizationSelect,
  });
  if (!event) {
    throw new NotFoundError('Event not found');
  }
  assertPaidTicketingAllowed(event.organization, [data]);

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
  const userId = await resolveOrganizerScope(prisma, actor);

  const owned = await prisma.ticketTypes.findFirst({
    where: {
      id: ticketTypeId,
      eventId,
      event: eventsWhereCan(userId, Capability.EventEdit),
    },
    select: {
      id: true,
      price: true,
      priceCents: true,
      event: { select: eventOrganizationSelect },
    },
  });
  if (!owned) {
    throw new NotFoundError('Ticket type not found');
  }
  // Only the free → paid transition is gated: a row already paid stays
  // editable even if the org lost — or never had — approval.
  const storedPriceCents = owned.priceCents ?? toCents(owned.price);
  if (storedPriceCents === 0) {
    assertPaidTicketingAllowed(owned.event.organization, [data]);
  }

  await prisma.ticketTypes.update({
    where: { id: ticketTypeId },
    data: ticketTypeWriteFields(data),
  });
}
