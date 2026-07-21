/**
 * One derivation of an event's lifecycle status, shared by every organizer read
 * so the events list and the event detail can't disagree (they used to compute
 * it separately). `now` is injectable for tests.
 *
 * `startsAt`/`endsAt` are full timestamps — the event form folds the time input
 * into them before submitting (see ADR 0020).
 */
import type { EventStatus } from '../../contracts/organizer';

/**
 * - `Draft`    — not published.
 * - `Upcoming` — published, starts in the future.
 * - `Active`   — published, currently running (start ≤ now ≤ end).
 * - `Past`     — published, already ended.
 */
export function getEventStatus(
  event: { isDraft: boolean; startsAt: Date; endsAt: Date },
  now: Date = new Date()
): EventStatus {
  if (event.isDraft) return 'Draft';
  if (now < event.startsAt) return 'Upcoming';
  if (now > event.endsAt) return 'Past';
  return 'Active';
}
