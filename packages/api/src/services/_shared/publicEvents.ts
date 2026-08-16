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

/**
 * App/Play Store review account (also hardcoded in apps/mobile's login.tsx).
 * Its events are QA fixtures, not real listings — kept out of public
 * discovery for everyone except the reviewer signed in as this account.
 */
export const REVIEW_ACCOUNT_EMAIL = 'test@usetroptix.com';
