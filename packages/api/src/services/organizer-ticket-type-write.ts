// Capacity may deliberately be edited below `sold` — it stops further sales
// and corrupts nothing, so no guard belongs here.
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  ticketTypeInputSchema,
  type TicketTypeInput,
} from '../contracts/organizer';
import { writeLegacyAccessCode } from './_shared/access-code';
import { NotFoundError } from './_shared/errors';
import { requireOwnedEvent } from './_shared/owned-event';
import { generateId } from './_shared/ids';
import { toCents } from './_shared/organizerMapping';
import { assertPaidTicketingAllowed } from './_shared/paid-ticketing';
import { ticketTypeWriteFields } from './_shared/ticket-type-fields';
import {
  eventsInScope,
  organizationInScope,
  resolveOrganizerScope,
} from './organizer-scope';

export async function createTicketType(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  input: TicketTypeInput
): Promise<{ ticketTypeId: string }> {
  const data = ticketTypeInputSchema.parse(input);
  const scope = await resolveOrganizerScope(prisma, actor);

  const [, org] = await Promise.all([
    requireOwnedEvent(prisma, scope, eventId),
    prisma.organization.findFirst({ where: organizationInScope(scope) }),
  ]);
  assertPaidTicketingAllowed(
    { paidTicketingEnabled: org?.paidTicketingEnabled ?? false },
    [data]
  );

  const ticketTypeId = generateId();
  await prisma.$transaction(async (tx) => {
    await tx.ticketTypes.create({
      data: { id: ticketTypeId, eventId, ...ticketTypeWriteFields(data) },
    });
    await writeLegacyAccessCode(tx, eventId, ticketTypeId, data.accessCode);
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
  const scope = await resolveOrganizerScope(prisma, actor);

  const [owned, org] = await Promise.all([
    prisma.ticketTypes.findFirst({
      where: {
        id: ticketTypeId,
        eventId,
        event: eventsInScope(scope),
      },
      select: { id: true, price: true, priceCents: true },
    }),
    prisma.organization.findFirst({ where: organizationInScope(scope) }),
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

  await prisma.$transaction(async (tx) => {
    await tx.ticketTypes.update({
      where: { id: ticketTypeId },
      data: ticketTypeWriteFields(data),
    });
    await writeLegacyAccessCode(tx, eventId, ticketTypeId, data.accessCode);
  });
}
