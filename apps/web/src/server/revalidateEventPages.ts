import { revalidatePath } from 'next/cache';

/**
 * Bust every ISR-cached public page that renders this event. One helper so a
 * new public surface is added here once, not to per-mutation path lists.
 */
export function revalidateEventPublicPages(
  eventId: string,
  orgSlug: string | null | undefined
) {
  revalidatePath(`/e/${eventId}`);
  revalidatePath('/discover');
  if (orgSlug) {
    revalidatePath(`/o/${orgSlug}`);
  }
}
