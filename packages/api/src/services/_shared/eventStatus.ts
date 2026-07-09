/**
 * One derivation of an event's lifecycle status, shared by every organizer read
 * so the events list and the event detail can't disagree (they used to compute
 * it separately). `now` is injectable for tests.
 */
export type EventStatus = 'Draft' | 'Upcoming' | 'Active' | 'Past';

/**
 * - `Draft`    — not published.
 * - `Upcoming` — published, starts in the future.
 * - `Active`   — published, currently running (start ≤ now ≤ end).
 * - `Past`     — published, already ended.
 *
 * Prefers the reservation-era `startsAt`/`endsAt` single-DateTime columns,
 * falling back to the legacy split `startDate`/`endDate` until the backfill.
 */
export function getEventStatus(
  event: {
    isDraft: boolean;
    startsAt?: Date | null;
    endsAt?: Date | null;
    startDate: Date;
    endDate: Date;
  },
  now: Date = new Date()
): EventStatus {
  if (event.isDraft) return 'Draft';

  const start = event.startsAt ?? event.startDate;
  const end = event.endsAt ?? event.endDate;

  if (now < start) return 'Upcoming';
  if (now > end) return 'Past';
  return 'Active';
}
