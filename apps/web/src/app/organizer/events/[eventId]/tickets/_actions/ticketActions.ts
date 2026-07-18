'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/prisma';
import { generateId } from '@/lib/utils';
import {
  TicketTypeFormValues,
  ticketTypeSchema,
} from '@/lib/schemas/ticketSchema';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { canAccessEvent } from '@/server/accessControl';
import { redirect } from 'next/navigation';

// Define the return type for actions
interface ActionResult {
  success: boolean;
  error?: string;
}

export async function createTicketType(
  eventId: string,
  formData: TicketTypeFormValues
): Promise<ActionResult> {
  const validationResult = ticketTypeSchema.safeParse(formData);
  if (!validationResult.success) {
    console.error(
      'Server-side validation failed:',
      validationResult.error.flatten()
    );
    return { success: false, error: 'Invalid form data provided.' };
  }

  const data = validationResult.data;

  // Resolve the session outside the try so redirect()'s control-flow throw
  // isn't swallowed by the catch below.
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  try {
    // Verify the user owns this event (or is a platform owner).
    const hasAccess = await canAccessEvent(user.uid, user.email, eventId);
    if (!hasAccess) {
      return { success: false, error: 'Unauthorized' };
    }
    const ticketTypeEnum = data.price === 0 ? 'FREE' : 'PAID';

    await prisma.ticketTypes.create({
      data: {
        id: generateId(),
        eventId: eventId,
        name: data.name,
        description: data.description ?? '', // Handle optional description
        price: data.price,
        priceCents: Math.round(data.price * 100),
        capacity: data.capacity,
        maxPurchasePerUser: data.maxPurchasePerUser,
        saleStartsAt: data.saleStartsAt,
        saleEndsAt: data.saleEndsAt,
        ticketingFees: data.ticketingFees,
        ticketType: ticketTypeEnum,
        discountCode: data.discountCode || null,
      },
    });
    console.log('Ticket type created:', data);

    revalidatePath(`/organizer/events/${eventId}/tickets`);

    return { success: true };
  } catch (error) {
    console.error('Error creating ticket type:', error);
    return {
      success: false,
      error: 'Failed to create ticket type. Please try again.',
    };
  }
}

export async function updateTicketType(
  ticketId: string,
  formData: TicketTypeFormValues
): Promise<ActionResult> {
  const validationResult = ticketTypeSchema.safeParse(formData);
  if (!validationResult.success) {
    console.error(
      'Server-side validation failed:',
      validationResult.error.flatten()
    );
    return { success: false, error: 'Invalid form data provided.' };
  }

  const data = validationResult.data;

  let eventIdForRevalidation: string | undefined;

  // Resolve the session outside the try so redirect()'s control-flow throw
  // isn't swallowed by the catch below.
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  try {
    // Resolve the ticket's event and verify the user owns it (or is a platform
    // owner). Without this, any authenticated user could edit any ticket type.
    const existing = await prisma.ticketTypes.findUnique({
      where: { id: ticketId },
      select: { eventId: true },
    });
    if (!existing) {
      return { success: false, error: 'Ticket type not found.' };
    }
    const hasAccess = await canAccessEvent(
      user.uid,
      user.email,
      existing.eventId
    );
    if (!hasAccess) {
      return { success: false, error: 'Unauthorized' };
    }

    const ticketTypeEnum = data.price === 0 ? 'FREE' : 'PAID';

    const updatedTicket = await prisma.ticketTypes.update({
      where: {
        id: ticketId,
      },
      data: {
        name: data.name,
        description: data.description ?? '',
        price: data.price,
        priceCents: Math.round(data.price * 100),
        capacity: data.capacity,
        maxPurchasePerUser: data.maxPurchasePerUser,
        saleStartsAt: data.saleStartsAt,
        saleEndsAt: data.saleEndsAt,
        ticketingFees: data.ticketingFees,
        ticketType: ticketTypeEnum,
        discountCode: data.discountCode || null,
      },
      select: { eventId: true },
    });

    eventIdForRevalidation = updatedTicket.eventId;

    if (eventIdForRevalidation) {
      revalidatePath(`/organizer/events/${eventIdForRevalidation}/tickets`);
      revalidatePath(
        `/organizer/events/${eventIdForRevalidation}/tickets/${ticketId}`
      );
    }

    return { success: true };
  } catch (error) {
    console.error(`Error updating ticket type ${ticketId}:`, error);
    return {
      success: false,
      error: 'Failed to update ticket type. Please try again.',
    };
  }
}
