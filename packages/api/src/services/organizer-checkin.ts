// The frozen legacy `checkInTicket` in organizer.ts duplicates these guards;
// until the app rebuild retires it, guard changes must land in both places.
import { TicketStatus, type PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { ConflictError, NotFoundError } from './_shared/errors';
import { requireOwnedEvent } from './_shared/owned-event';
import { resolveOrganizerScope } from './organizer-scope';

// Un-checked-in is two statuses mid-cutover: legacy AVAILABLE and the
// canonical VALID the reservation checkout mints.
const UNCHECKED_STATUSES: TicketStatus[] = [
  TicketStatus.AVAILABLE,
  TicketStatus.VALID,
];
const CHECKED_IN_STATUSES: TicketStatus[] = [TicketStatus.NOT_AVAILABLE];

export type ScanTicketResult = {
  ticketName: string | undefined;
  ticketDescription: string | undefined;
  scanSucceeded: boolean;
};

// Atomic check-then-flip: the un-checked status is part of the write
// predicate, so two simultaneous scans of one QR can't both succeed.
export async function scanTicket(
  prisma: PrismaClient,
  actor: Actor,
  input: { ticketId: string; eventId: string }
): Promise<ScanTicketResult> {
  const organizerUserId = await resolveOrganizerScope(prisma, actor);
  await requireOwnedEvent(prisma, organizerUserId, input.eventId);

  const ticket = await prisma.tickets.findUnique({
    where: { id: input.ticketId, eventId: input.eventId },
    include: { ticketType: true },
  });
  if (!ticket) {
    return {
      ticketName: undefined,
      ticketDescription: undefined,
      scanSucceeded: false,
    };
  }

  const result = await prisma.tickets.updateMany({
    where: {
      id: input.ticketId,
      eventId: input.eventId,
      status: { in: UNCHECKED_STATUSES },
      checkinTimestamp: null,
    },
    data: { status: TicketStatus.NOT_AVAILABLE, checkinTimestamp: new Date() },
  });

  return {
    ticketName: ticket.ticketType?.name ?? 'Complementary',
    ticketDescription: ticket.ticketType?.description ?? '',
    scanSucceeded: result.count === 1,
  };
}

// Ownership is resolved through the event join, so a foreign ticket id reads
// as not found rather than forbidden.
export async function toggleTicketCheckIn(
  prisma: PrismaClient,
  actor: Actor,
  input: { ticketId: string }
) {
  const organizerUserId = await resolveOrganizerScope(prisma, actor);

  const ticket = await prisma.tickets.findFirst({
    where: {
      id: input.ticketId,
      event: { organizerUserId, deletedAt: null },
    },
    select: { id: true, status: true },
  });
  if (!ticket) {
    throw new NotFoundError('Ticket not found');
  }

  // Both directions allow-listed: a void ticket (USED/CANCELLED/REFUNDED) can
  // never be rewritten scannable. Undo restores legacy AVAILABLE, as always.
  const checkingIn = UNCHECKED_STATUSES.includes(ticket.status);
  const checkingOut = CHECKED_IN_STATUSES.includes(ticket.status);
  if (!checkingIn && !checkingOut) {
    throw new ConflictError('This ticket is not valid for entry');
  }

  // Atomic check-then-flip, matching scanTicket: the status the read saw is
  // part of the write predicate, so two simultaneous toggles can't both win.
  const [updated] = await prisma.tickets.updateManyAndReturn({
    where: {
      id: ticket.id,
      status: { in: checkingIn ? UNCHECKED_STATUSES : CHECKED_IN_STATUSES },
    },
    data: {
      status: checkingIn ? TicketStatus.NOT_AVAILABLE : TicketStatus.AVAILABLE,
      checkinTimestamp: checkingIn ? new Date() : null,
    },
  });
  if (!updated) {
    throw new ConflictError('Someone else just changed this ticket');
  }
  return updated;
}
