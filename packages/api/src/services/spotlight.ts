/**
 * Per-event Spotlight authoring: replace an event's spotlight cards in one shot.
 *
 * Prisma is injected (unit-testable, ADR 0010). Ownership is enforced here
 * (ADR 0013): the caller's `ownerUserId` must match the event's
 * `organizerUserId`, or it's a NotFound (don't leak another organizer's event).
 * See docs/plans/2026-06-event-spotlight-and-organizer-brand.md (F6).
 */
import type { PrismaClient } from '@troptix/db';
import type { SpotlightItem, SpotlightInputItem } from '../contracts/events';
import { NotFoundError } from './_shared/errors';

export interface SaveEventSpotlightArgs {
  eventId: string;
  ownerUserId: string;
  items: SpotlightInputItem[];
}

/**
 * Replace every spotlight card on an event with `items`, in the given order
 * (array index → stored `order`). Full-replace, not a diff: the simplest correct
 * model for a small reorderable list, and it makes reordering a no-op to persist.
 * Returns the persisted cards. Throws NotFoundError when the event doesn't exist
 * or isn't owned by the caller.
 */
export async function saveEventSpotlight(
  prisma: PrismaClient,
  { eventId, ownerUserId, items }: SaveEventSpotlightArgs
): Promise<SpotlightItem[]> {
  const event = await prisma.events.findFirst({
    where: { id: eventId, organizerUserId: ownerUserId },
    select: { id: true },
  });
  if (!event) {
    throw new NotFoundError(`Event ${eventId} not found`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.spotlight.deleteMany({ where: { eventId } });
    if (items.length > 0) {
      await tx.spotlight.createMany({
        data: items.map((item, index) => ({
          eventId,
          title: item.title,
          link: item.link ?? null,
          imageUrl: item.imageUrl ?? null,
          description: item.description ?? null,
          order: index,
        })),
      });
    }
  });

  return prisma.spotlight.findMany({
    where: { eventId },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      title: true,
      link: true,
      imageUrl: true,
      description: true,
    },
  });
}
