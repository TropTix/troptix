import type { PrismaClient } from '@troptix/db';
import { NotFoundError } from './errors';

/**
 * NotFound, never Forbidden, so foreign ids can't be probed. The one home of
 * the write-path ownership rule (ADR 0022) — redefine here, not at call sites.
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
