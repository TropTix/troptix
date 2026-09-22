import { revalidatePath } from 'next/cache';

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
