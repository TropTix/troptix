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
import { NotFoundError } from './_shared/errors';
import { resolveOrganizerScope } from './organizer-scope';

export type ScanTicketResult = {
  ticketName: string | undefined;
  ticketDescription: string | undefined;
  scanSucceeded: boolean;
};

/**
 * Door scan: one-way check-in, atomic check-then-flip — only the request that
 * finds the ticket still AVAILABLE flips it, so two simultaneous scans of the
 * same QR can't both succeed. A ticket that doesn't exist (or belongs to a
 * different event) is a failed scan, not an error — the scanner UI shows
 * "invalid ticket" either way. An event the actor doesn't own is NotFound.
 */
export async function scanTicket(
  prisma: PrismaClient,
  actor: Actor,
  input: { ticketId: string; eventId: string }
): Promise<ScanTicketResult> {
  const organizerUserId = await resolveOrganizerScope(prisma, actor);

  const event = await prisma.events.findFirst({
    where: { id: input.eventId, organizerUserId, deletedAt: null },
    select: { id: true },
  });
  if (!event) {
    throw new NotFoundError('Event not found');
  }

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
      status: TicketStatus.AVAILABLE,
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

  const checkingIn = ticket.status === TicketStatus.AVAILABLE;
  return prisma.tickets.update({
    where: { id: ticket.id },
    data: {
      status: checkingIn ? TicketStatus.NOT_AVAILABLE : TicketStatus.AVAILABLE,
      checkinTimestamp: checkingIn ? new Date() : null,
    },
  });
}
