import {
  getPublishRequirementsSummary,
  validateEventForPublish,
} from '@/lib/validations/publishValidation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import prisma from '@/server/prisma';
import { eventsWhereCan } from '@troptix/api/server';
import { revalidateEventPublicPages } from '@/server/revalidateEventPages';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

export async function PATCH(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ eventId: string }>;
  }
): Promise<NextResponse> {
  const { eventId } = await params;
  try {
    const user = await getUserFromIdTokenCookie();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const event = await prisma.events.findFirst({
      where: { id: eventId, ...eventsWhereCan(user.uid, 'event.edit') },
      select: {
        id: true,
        isDraft: true,
        name: true,
        description: true,
        organizer: true,
        startsAt: true,
        endsAt: true,
        venue: true,
        address: true,
        imageUrl: true,
        organization: { select: { slug: true, paidTicketingEnabled: true } },
        ticketTypes: {
          select: {
            id: true,
            name: true,
            price: true,
            capacity: true,
            maxPurchasePerUser: true,
            saleStartsAt: true,
            saleEndsAt: true,
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: 'Event not found or unauthorized.' },
        { status: 404 }
      );
    }

    if (event.isDraft) {
      // Paid ticketing is the owning Organization's approval, not a user
      // role — the same flag the @troptix/api write services enforce.
      const validationResult = validateEventForPublish(
        event,
        event.organization.paidTicketingEnabled
      );

      if (!validationResult.isValid) {
        return NextResponse.json(
          {
            error: 'Event cannot be published yet',
            validationErrors: validationResult.errors,
            missingRequirements: validationResult.missingRequirements,
            summary: getPublishRequirementsSummary(validationResult),
          },
          { status: 400 }
        );
      }
    }

    const updatedEvent = await prisma.events.update({
      where: { id: eventId },
      data: { isDraft: !event.isDraft },
      select: { id: true, isDraft: true },
    });

    revalidatePath(`/organizer/events/${eventId}`);
    revalidateEventPublicPages(eventId, event.organization?.slug);

    return NextResponse.json(
      {
        success: true,
        eventId: eventId,
        isDraft: updatedEvent.isDraft,
        status: updatedEvent.isDraft ? 'draft' : 'published',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(`Error toggling publish status for event`, error);
    return NextResponse.json(
      { error: 'Failed to toggle publish status. Please try again.' },
      { status: 500 }
    );
  }
}
