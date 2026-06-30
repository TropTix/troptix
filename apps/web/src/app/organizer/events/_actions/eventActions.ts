'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/prisma';
import { generateId } from '@/lib/utils';
import { reservationColumns } from '@/lib/reservationColumns';
import { eventFormSchema, EventFormValues } from '@/lib/schemas/eventSchema';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { redirect } from 'next/navigation';
interface ActionResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export async function createEvent(
  formData: EventFormValues
): Promise<ActionResult> {
  const validationResult = eventFormSchema.safeParse(formData);
  if (!validationResult.success) {
    console.error(
      'Server-side validation failed (createEvent):',
      validationResult.error.flatten()
    );
    const firstError = validationResult.error.errors[0]?.message;
    return {
      success: false,
      error: firstError || 'Invalid event data provided.',
    };
  }

  const data = validationResult.data;

  try {
    const user = await getUserFromIdTokenCookie();
    if (!user) {
      redirect('/auth/signin');
      return { success: false, error: 'Authentication required.' };
    }

    const newEventId = generateId();

    await prisma.$transaction(async (tx) => {
      await tx.events.create({
        data: {
          id: newEventId,
          organizerUserId: user.uid,
          isDraft: true,
          name: data.eventName,
          description: data.description ?? '',
          organizer: data.organizer,
          startDate: data.startDate,
          endDate: data.endDate,
          venue: data.venue,
          address: data.address,
          country: data.country,
          countryCode: data.countryCode,
          latitude: data.latitude,
          longitude: data.longitude,
          imageUrl: data.imageUrl,
        },
      });

      if (data.tickets && data.tickets.length > 0) {
        await Promise.all(
          data.tickets.map((ticket) => {
            const ticketTypeEnum = ticket.price === 0 ? 'FREE' : 'PAID';
            return tx.ticketTypes.create({
              data: {
                id: generateId(),
                eventId: newEventId,
                name: ticket.name,
                description: ticket.description ?? '',
                price: ticket.price,
                quantity: ticket.quantity,
                maxPurchasePerUser: ticket.maxPurchasePerUser,
                saleStartDate: ticket.saleStartDate,
                saleEndDate: ticket.saleEndDate,
                ticketingFees: ticket.ticketingFees,
                ticketType: ticketTypeEnum,
                // Reservation-era columns the new checkout reads.
                ...reservationColumns(ticket),
              },
            });
          })
        );
      }
    });

    console.log(
      'Event and associated tickets created successfully:',
      newEventId
    );

    // Revalidate the path to show the new event in lists
    revalidatePath('/organizer/events');

    return { success: true, eventId: newEventId };
  } catch (error) {
    console.error('Error creating event:', error);
    return {
      success: false,
      error: 'Failed to create event. Please try again.',
    };
  }
}

// Placeholder for updateEvent action
export async function updateEvent(
  eventId: string,
  formData: EventFormValues // Using the full form values type for input
): Promise<ActionResult> {
  const dataToValidate = { ...formData, tickets: [] };
  const validationResult = eventFormSchema.safeParse(dataToValidate);

  if (!validationResult.success) {
    console.error(
      'Server-side validation failed (updateEvent):',
      validationResult.error.flatten()
    );
    const firstError = validationResult.error.errors[0]?.message;
    return {
      success: false,
      error: firstError || 'Invalid event data provided for update.',
    };
  }

  const { tickets, ...data } = validationResult.data;

  try {
    const user = await getUserFromIdTokenCookie();
    if (!user) {
      return { success: false, error: 'Authentication required.' };
    }

    const event = await prisma.events.findUnique({
      where: { id: eventId, organizerUserId: user.uid },
      select: { id: true },
    });

    if (!event) {
      return { success: false, error: 'Event not found or unauthorized.' };
    }

    // Update the Event
    await prisma.events.update({
      where: { id: eventId },
      data: {
        name: data.eventName,
        description: data.description ?? '',
        organizer: data.organizer,
        startDate: data.startDate,
        endDate: data.endDate,
        venue: data.venue,
        address: data.address,
        country: data.country,
        countryCode: data.countryCode,
        latitude: data.latitude,
        longitude: data.longitude,
        imageUrl: data.imageUrl,
      },
    });

    console.log('Event updated successfully:', eventId);

    revalidatePath('/organizer/events');
    revalidatePath(`/organizer/events/${eventId}`);
    // Public listing is ISR-cached (revalidate = 86400) — bust it on edit so
    // organizer changes aren't stale for up to 24h.
    revalidatePath('/events');
    revalidatePath(`/events/${eventId}`);

    return { success: true, eventId: eventId };
  } catch (error) {
    console.error(`Error updating event ${eventId}:`, error);
    return {
      success: false,
      error: 'Failed to update event. Please try again.',
    };
  }
}
