import type { Prisma } from '@troptix/db';

/**
 * Every public listing surface must spread this filter; draft and private
 * events staying reachable by direct link is deliberate.
 */
export const publicEventsWhere = {
  isDraft: false,
  isPrivate: false,
} satisfies Prisma.EventsWhereInput;
