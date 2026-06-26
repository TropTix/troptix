'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/prisma';
import { generateId } from '@/lib/utils';
import { reservationColumns } from '@/lib/reservationColumns';
import {
  TicketTypeFormValues,
  ticketTypeSchema,
} from '@/lib/schemas/ticketSchema';
import { getUserFromIdTokenCookie } from '@/server/authUser';
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

  try {
    const user = await getUserFromIdTokenCookie();
    if (!user) {
      redirect('/auth/signin');
    }
    // Verify user is the organizer of the event
    const event = await prisma.events.findUnique({
      where: { id: eventId, organizerUserId: user.uid },
    });
    if (!event) {
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
        quantity: data.quantity,
        maxPurchasePerUser: data.maxPurchasePerUser,
        saleStartDate: data.saleStartDate,
        saleEndDate: data.saleEndDate,
        ticketingFees: data.ticketingFees,
        ticketType: ticketTypeEnum,
        discountCode: data.discountCode || null,
        // Reservation-era columns the new checkout reads.
        ...reservationColumns(data),
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

  try {
    const ticketTypeEnum = data.price === 0 ? 'FREE' : 'PAID';

    const updatedTicket = await prisma.ticketTypes.update({
      where: {
        id: ticketId,
      },
      data: {
        name: data.name,
        description: data.description ?? '',
        price: data.price,
        quantity: data.quantity,
        maxPurchasePerUser: data.maxPurchasePerUser,
        saleStartDate: data.saleStartDate,
        saleEndDate: data.saleEndDate,
        ticketingFees: data.ticketingFees,
        ticketType: ticketTypeEnum,
        discountCode: data.discountCode || null,
        // Keep the reservation-era columns in sync (see create).
        ...reservationColumns(data),
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
