// Card-level fields only — listings deliberately carry no tier data (#549),
// so tier writes never invalidate them.
import type { EventSummary } from '../../contracts/events';

export type EventSummaryRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  venue: string | null;
};

export function toEventSummary(event: EventSummaryRow): EventSummary {
  return {
    id: event.id,
    name: event.name,
    imageUrl: event.imageUrl,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    venue: event.venue,
  };
}
