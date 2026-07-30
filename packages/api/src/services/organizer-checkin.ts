/**
 * Check-in writes on the authorization seam (ADR 0013, teams Phase 0).
 *
 * Ownership via `resolveOrganizerScope`, no View-as target (writes never take
 * one, ADR 0018), no platform-owner bypass. One exception remains outside this
 * file: the frozen legacy `checkInTicket` in organizer.ts (the mobile tRPC
 * path, same guards, string errors) — it dies with the app rebuild, and until
 * then Membership (ADR 0022) must land in both places.
 */
import { TicketStatus, type PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { ConflictError, NotFoundError } from './_shared/errors';
import { requireOwnedEvent } from './_shared/owned-event';
import { resolveOrganizerScope } from './organizer-scope';

// Un-checked-in is two statuses mid-cutover: legacy AVAILABLE and the
// canonical VALID the reservation checkout mints. Annotated as TicketStatus[]
// so adding an enum member is a compile error at every allow-list below,
// rather than something an `else` silently absorbs.
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

/**
 * Door scan: atomic check-then-flip, so two simultaneous scans of one QR
 * can't both succeed. A missing/foreign ticket is a failed scan, not an
 * error; an event the actor doesn't own is NotFound.
 */
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

/**
 * Two-way check-in toggle (the attendee table's switch, and the legacy app's
 * check-in button): flips status and stamps/clears the check-in time. The
 * ticket must belong to an event the actor owns — resolved through the event
 * join, so a foreign ticket id reads as not found rather than forbidden.
 */
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

  // Both directions are allow-listed: a void ticket (USED, CANCELLED,
  // REFUNDED) is neither checkable-in nor checkable-out, so it can never be
  // rewritten into a scannable state. Undo restores AVAILABLE, the legacy
  // un-checked state, as it always has.
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
