/**
 * One derivation of an event's lifecycle status, shared by every organizer read
 * so the events list and the event detail can't disagree (they used to compute
 * it separately). `now` is injectable for tests.
 */
import type { EventStatus } from '../../contracts/organizer';
import { endsAtOf, startsAtOf } from './organizerMapping';

/**
 * - `Draft`    — not published.
 * - `Upcoming` — published, starts in the future.
 * - `Active`   — published, currently running (start ≤ now ≤ end).
 * - `Past`     — published, already ended.
 */
export function getEventStatus(
  event: {
    isDraft: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    startDate: Date;
    endDate: Date;
  },
  now: Date = new Date()
): EventStatus {
  if (event.isDraft) return 'Draft';

  if (now < startsAtOf(event)) return 'Upcoming';
  if (now > endsAtOf(event)) return 'Past';
  return 'Active';
}
