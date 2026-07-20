'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import prisma from '@/server/prisma';
import { eventFormSchema, EventFormValues } from '@/lib/schemas/eventSchema';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import { ZodError } from 'zod';
import {
  createEvent as createEventService,
  updateEvent as updateEventService,
  NotFoundError,
  PaidTicketingNotEnabledError,
  UnauthorizedError,
} from '@troptix/api/server';

interface ActionResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

// Thin adapters over the @troptix/api write seam (Screen D plan): validate the
// form shape here for field-level messages, convert dollars → integer cents,
// and let the service own authorization, the paid-ticketing gate, and the
// transaction.

export async function createEvent(
  formData: EventFormValues
): Promise<ActionResult> {
  const validationResult = eventFormSchema.safeParse(formData);
  if (!validationResult.success) {
    const firstError = validationResult.error.errors[0]?.message;
    return {
      success: false,
      error: firstError || 'Invalid event data provided.',
    };
  }
  const data = validationResult.data;

  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }

  try {
    const { eventId } = await createEventService(
      prisma,
      userToActor(user),
      toServiceInput(data)
    );

    revalidatePath('/organizer/events');
    return { success: true, eventId };
  } catch (error) {
    return failure(error, 'Failed to create event. Please try again.');
  }
}

export async function updateEvent(
  eventId: string,
  formData: EventFormValues
): Promise<ActionResult> {
  const validationResult = eventFormSchema.safeParse({
    ...formData,
    tickets: [],
  });
  if (!validationResult.success) {
    const firstError = validationResult.error.errors[0]?.message;
    return {
      success: false,
      error: firstError || 'Invalid event data provided for update.',
    };
  }
  const data = validationResult.data;

  const user = await getServerUser();
  if (!user) {
    return { success: false, error: 'Authentication required.' };
  }

  try {
    // Event fields only — ticket-type editing is Screen E's seam (#465).
    const { ticketTypes: _tickets, ...fields } = toServiceInput(data);
    await updateEventService(prisma, userToActor(user), eventId, fields);

    revalidatePath('/organizer/events');
    revalidatePath(`/organizer/events/${eventId}`);
    // Public listing is ISR-cached (revalidate = 86400) — bust it on edit so
    // organizer changes aren't stale for up to 24h.
    revalidatePath('/discover');
    revalidatePath(`/e/${eventId}`);

    return { success: true, eventId };
  } catch (error) {
    return failure(error, 'Failed to update event. Please try again.');
  }
}

function toServiceInput(data: EventFormValues) {
  return {
    name: data.eventName,
    description: data.description ?? '',
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    venue: data.venue,
    address: data.address,
    country: data.country,
    countryCode: data.countryCode,
    latitude: data.latitude,
    longitude: data.longitude,
    imageUrl: data.imageUrl,
    ticketTypes: (data.tickets ?? []).map((ticket) => ({
      name: ticket.name,
      description: ticket.description,
      priceCents: Math.round(ticket.price * 100),
      capacity: ticket.capacity,
      maxPurchasePerUser: ticket.maxPurchasePerUser,
      saleStartsAt: ticket.saleStartsAt,
      saleEndsAt: ticket.saleEndsAt,
      ticketingFees: ticket.ticketingFees,
    })),
  };
}

function failure(error: unknown, fallback: string): ActionResult {
  if (error instanceof PaidTicketingNotEnabledError) {
    return {
      success: false,
      error:
        'Paid tickets need approval first — talk to us to enable paid ticketing, or set the price to free.',
    };
  }
  if (error instanceof NotFoundError) {
    return { success: false, error: 'Event not found or unauthorized.' };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: 'Authentication required.' };
  }
  // The service re-validates against the contract schema; surface its first
  // issue instead of the generic fallback if the two schemas ever drift.
  if (error instanceof ZodError) {
    return {
      success: false,
      error: error.errors[0]?.message || 'Invalid event data provided.',
    };
  }
  console.error('Event write failed:', error);
  return { success: false, error: fallback };
}
