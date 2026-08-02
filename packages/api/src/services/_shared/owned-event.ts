import type { PrismaClient } from '@troptix/db';
import { NotFoundError } from './errors';

/**
 * The seam's ownership assert: the event exists, is live, and belongs to the
 * resolved organizer — else NotFound (never Forbidden, so foreign ids can't be
 * probed). One home so that when Phase 1 redefines ownership as membership in
 * the owning Organization (ADR 0022), every write path changes here at once.
 */
export async function requireOwnedEvent(
  prisma: PrismaClient,
  organizerUserId: string,
  eventId: string
): Promise<void> {
  const owned = await prisma.events.findFirst({
    where: { id: eventId, organizerUserId, deletedAt: null },
    select: { id: true },
  });
  if (!owned) {
    throw new NotFoundError('Event not found');
  }
}
