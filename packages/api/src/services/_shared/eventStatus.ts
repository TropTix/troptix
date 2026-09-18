import type { EventStatus } from '../../contracts/organizer';

export function getEventStatus(
  event: { isDraft: boolean; startsAt: Date; endsAt: Date },
  now: Date = new Date()
): EventStatus {
  if (event.isDraft) return 'Draft';
  if (now < event.startsAt) return 'Upcoming';
  if (now > event.endsAt) return 'Past';
  return 'Active';
}
