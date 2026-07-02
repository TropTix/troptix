import {
  getPublishRequirementsSummary,
  validateEventForPublish,
} from '@/lib/validations/publishValidation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import prisma from '@/server/prisma';
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

    const userRole = await prisma.users.findUnique({
      where: {
        id: user.uid,
      },
      select: {
        role: true,
      },
    });
    const paidEventsEnabled = userRole?.role === 'ORGANIZER';

    const event = await prisma.events.findUnique({
      where: { id: eventId, organizerUserId: user.uid },
      select: {
        id: true,
        isDraft: true,
        name: true,
        description: true,
        organizer: true,
        startDate: true,
        endDate: true,
        venue: true,
        address: true,
        imageUrl: true,
        ticketTypes: {
          select: {
            id: true,
            name: true,
            price: true,
            quantity: true,
            maxPurchasePerUser: true,
            saleStartDate: true,
            saleEndDate: true,
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

    // If trying to publish (isDraft is currently true), validate requirements
    if (event.isDraft) {
      const validationResult = validateEventForPublish(
        event,
        paidEventsEnabled
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
    revalidatePath(`/e/${eventId}`);
    revalidatePath(`/events`);

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
