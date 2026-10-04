import type { PrismaClient } from '@troptix/db';
import { NotFoundError } from './errors';
import { eventsInScope, type OrganizerScope } from '../organizer-scope';

/**
 * NotFound, never Forbidden, so foreign ids can't be probed. The one home of
 * the write-path ownership rule (ADR 0022) — redefine here, not at call sites.
 */
export async function requireOwnedEvent(
  prisma: PrismaClient,
  scope: OrganizerScope,
  eventId: string
): Promise<void> {
  const owned = await prisma.events.findFirst({
    where: { id: eventId, ...eventsInScope(scope) },
    select: { id: true },
  });
  if (!owned) {
    throw new NotFoundError('Event not found');
  }
}
