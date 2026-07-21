'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import prisma from '@/server/prisma';
import {
  TicketTypeFormValues,
  ticketTypeSchema,
} from '@/lib/schemas/ticketSchema';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import {
  createTicketType as createTicketTypeService,
  updateTicketType as updateTicketTypeService,
  toCents,
  NotFoundError,
  PaidTicketingNotEnabledError,
  UnauthorizedError,
} from '@troptix/api/server';

interface ActionResult {
  success: boolean;
  error?: string;
}

// Thin adapters over the @troptix/api ticket-type write seam (#452): validate
// the form shape for field-level messages, convert dollars → integer cents,
// and let the service own authorization, the paid gate, and the row shape.

export async function createTicketType(
  eventId: string,
  formData: TicketTypeFormValues
): Promise<ActionResult> {
  const validationResult = ticketTypeSchema.safeParse(formData);
  if (!validationResult.success) {
    return { success: false, error: 'Invalid form data provided.' };
  }

  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }

  try {
    await createTicketTypeService(
      prisma,
      userToActor(user),
      eventId,
      toServiceInput(validationResult.data)
    );
    revalidatePath(`/organizer/events/${eventId}/tickets`);
    return { success: true };
  } catch (error) {
    return failure(error, {
      // The create path's NotFound means the EVENT wasn't found/owned.
      notFound: 'Event not found or unauthorized.',
      fallback: 'Failed to create ticket type. Please try again.',
    });
  }
}

export async function updateTicketType(
  eventId: string,
  ticketTypeId: string,
  formData: TicketTypeFormValues
): Promise<ActionResult> {
  const validationResult = ticketTypeSchema.safeParse(formData);
  if (!validationResult.success) {
    return { success: false, error: 'Invalid form data provided.' };
  }

  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }

  try {
    await updateTicketTypeService(
      prisma,
      userToActor(user),
      eventId,
      ticketTypeId,
      toServiceInput(validationResult.data)
    );
    revalidatePath(`/organizer/events/${eventId}/tickets`);
    return { success: true };
  } catch (error) {
    return failure(error, {
      notFound: 'Ticket type not found or unauthorized.',
      fallback: 'Failed to update ticket type. Please try again.',
    });
  }
}

function toServiceInput(data: TicketTypeFormValues) {
  return {
    name: data.name,
    description: data.description,
    priceCents: toCents(data.price),
    capacity: data.capacity,
    maxPurchasePerUser: data.maxPurchasePerUser,
    saleStartsAt: data.saleStartsAt,
    saleEndsAt: data.saleEndsAt,
    ticketingFees: data.ticketingFees,
    discountCode: data.discountCode,
  };
}

function failure(
  error: unknown,
  messages: { notFound: string; fallback: string }
): ActionResult {
  if (error instanceof PaidTicketingNotEnabledError) {
    return {
      success: false,
      error:
        'Paid tickets need approval first — talk to us to enable paid ticketing, or set the price to free.',
    };
  }
  if (error instanceof NotFoundError) {
    return { success: false, error: messages.notFound };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: 'Authentication required.' };
  }
  if (error instanceof ZodError) {
    return {
      success: false,
      error: error.errors[0]?.message || 'Invalid form data provided.',
    };
  }
  console.error('Ticket-type write failed:', error);
  return { success: false, error: messages.fallback };
}
