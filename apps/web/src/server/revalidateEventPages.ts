import { revalidatePath, revalidateTag } from 'next/cache';

/** Data-cache tag for one event's public detail (see /e/[eventId]/page.tsx). */
export function eventDetailCacheTag(eventId: string) {
  return `event-${eventId}`;
}

/**
 * Bust one event's detail data cache. `{ expire: 0 }` = expire now ('max'
 * would serve one more stale view; updateTag is Server-Action-only and this
 * runs from Route Handlers too).
 */
export function revalidateEventDetail(eventId: string) {
  revalidateTag(eventDetailCacheTag(eventId), { expire: 0 });
}

/**
 * Bust every cached public surface that renders this event: the detail data
 * cache plus the ISR listings (/discover, /o/[slug]). One helper so a new
 * public surface is added here once, not to per-mutation path lists.
 * /e/[eventId] itself renders dynamically — if it ever becomes ISR again, a
 * revalidatePath(`/e/${eventId}`) must return here.
 */
export function revalidateEventPublicPages(
  eventId: string,
  orgSlug: string | null | undefined
) {
  revalidateEventDetail(eventId);
  revalidatePath('/discover');
  if (orgSlug) {
    revalidatePath(`/o/${orgSlug}`);
  }
}
