import type { Prisma } from '@troptix/db';

/**
 * The one definition of publicly listable: every public listing surface must
 * spread this filter, so a new surface can't forget half of it. Draft and
 * private events are reachable by direct link only.
 */
export const publicEventsWhere = {
  isDraft: false,
  isPrivate: false,
} satisfies Prisma.EventsWhereInput;
