'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/prisma';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import {
  saveEventSpotlightInputSchema,
  type SpotlightItem,
} from '@troptix/api';
import { saveEventSpotlight, NotFoundError } from '@troptix/api/server';
import { redirect } from 'next/navigation';

interface SpotlightActionResult {
  success: boolean;
  spotlight?: SpotlightItem[];
  error?: string;
}

/**
 * Replace an event's spotlight cards. `items` is the client-shaped card list in
 * display order; the service enforces ownership and persists a full replace.
 */
export async function saveSpotlightAction(
  eventId: string,
  items: unknown
): Promise<SpotlightActionResult> {
  const parsed = saveEventSpotlightInputSchema.safeParse({ eventId, items });
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message;
    return { success: false, error: firstError || 'Invalid spotlight data.' };
  }

  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  try {
    const spotlight = await saveEventSpotlight(prisma, {
      eventId: parsed.data.eventId,
      ownerUserId: user.uid,
      items: parsed.data.items,
    });

    revalidatePath(`/e/${eventId}`);
    revalidatePath(`/organizer/events/${eventId}/edit`);

    return { success: true, spotlight };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { success: false, error: 'Event not found or unauthorized.' };
    }
    console.error(`Error saving spotlight for event ${eventId}:`, error);
    return {
      success: false,
      error: 'Failed to save spotlight. Please try again.',
    };
  }
}
