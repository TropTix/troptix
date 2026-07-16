/**
 * One derivation of an event's lifecycle status, shared by every organizer read
 * so the events list and the event detail can't disagree (they used to compute
 * it separately). `now` is injectable for tests.
 *
 * Reads `startDate`/`endDate`, NOT the reservation-era `startsAt`/`endsAt`:
 * those were backfilled once and are written by nothing (`createEvent` leaves
 * them null, `updateEvent` leaves them stale), so the legacy columns are the
 * maintained source of truth. Revisit when roadmap 2.10 wires the writes.
 */
import type { EventStatus } from '../../contracts/organizer';

/**
 * - `Draft`    — not published.
 * - `Upcoming` — published, starts in the future.
 * - `Active`   — published, currently running (start ≤ now ≤ end).
 * - `Past`     — published, already ended.
 */
export function getEventStatus(
  event: { isDraft: boolean; startDate: Date; endDate: Date },
  now: Date = new Date()
): EventStatus {
  if (event.isDraft) return 'Draft';
  if (now < event.startDate) return 'Upcoming';
  if (now > event.endDate) return 'Past';
  return 'Active';
}
