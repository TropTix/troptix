import { revalidatePath, revalidateTag } from 'next/cache';

/** Data-cache tag for one event's public detail (see /e/[eventId]/page.tsx). */
export function eventDetailCacheTag(eventId: string) {
  return `event-${eventId}`;
}

/**
 * `{ expire: 0 }` = expire now; 'max' would serve one more stale view, and
 * updateTag is Server-Action-only while Route Handlers call this too.
 */
export function revalidateEventDetail(eventId: string) {
  revalidateTag(eventDetailCacheTag(eventId), { expire: 0 });
}

/**
 * Bust every cached public surface that renders this event. If /e/[eventId]
 * ever becomes ISR again, a revalidatePath for it must return here.
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
