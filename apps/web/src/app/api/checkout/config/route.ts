// app/api/checkout/config/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import {
  OrderStatus,
  Prisma,
  TicketFeeStructure,
} from '@/generated/prisma/client';
import { calculateFees } from '@/lib/fees';
import { CheckoutConfigResponse, CheckoutTicket } from '@/types/checkout';

export async function GET(
  req: NextRequest
): Promise<NextResponse<CheckoutConfigResponse | { message: string }>> {
  // TODO: Add authentication so only users or anonymous users can hit this endpoint
  // let userId: string | null = null;

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get('eventId');

  if (!eventId || typeof eventId !== 'string') {
    return NextResponse.json(
      { message: 'Missing or invalid "eventId" query parameter.' },
      { status: 400 }
    );
  }

  try {
    const ticketTypesData = await prisma.ticketTypes.findMany({
      where: {
        eventId: eventId,
        // If the discount code is null or empty, we consider it public
        OR: [
          {
            discountCode: { equals: null },
          },
          {
            discountCode: { equals: '' },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        quantity: true,
        maxPurchasePerUser: true,
        saleStartDate: true,
        saleEndDate: true,
        ticketingFees: true,
        ticketType: true,
        event: {
          select: {
            isDraft: true,
          },
        },
        _count: {
          select: {
            tickets: { where: { order: { status: OrderStatus.COMPLETED } } },
          },
        },
        tickets: {
          where: { order: { status: OrderStatus.PENDING } },
          select: { id: true }, // Only need ID for counting purposes
        },
      },
      orderBy: {
        price: Prisma.SortOrder.asc,
      },
    });

    if (ticketTypesData.length === 0) {
      const eventExists = await prisma.events.count({ where: { id: eventId } });
      if (eventExists === 0) {
        return NextResponse.json(
          { message: `Event with ID ${eventId} not found.` },
          { status: 404 }
        );
      }
      return NextResponse.json({ tickets: [] }, { status: 200 });
    }

    const now = new Date();
    const tickets: CheckoutTicket[] = ticketTypesData
      .map((tt) => {
        const completedOrdersCount = tt._count.tickets;
        const pendingOrdersCount = tt.tickets.length;
        const stock = Math.max(
          0,
          tt.quantity - completedOrdersCount - pendingOrdersCount
        );
        const saleIsActive = now >= tt.saleStartDate && now <= tt.saleEndDate;
        const isDraft = tt.event.isDraft;
        const maxAllowedToAdd =
          // If the event is draft, we don't allow any tickets to be added
          // If the sale is not active, we don't allow any tickets to be added
          // If the sale is active, we allow the max purchase per user
          saleIsActive && !isDraft
            ? Math.max(0, Math.min(stock, tt.maxPurchasePerUser))
            : 0;
        const ticketQuanityLow = stock > 0 && stock < 10;
        const fees =
          tt.ticketingFees === TicketFeeStructure.PASS_TICKET_FEES
            ? calculateFees(tt.price)
            : 0;

        return {
          id: tt.id,
          name: tt.name,
          description: tt.description,
          price: Number(tt.price),
          saleStartDate: tt.saleStartDate.toISOString(),
          saleEndDate: tt.saleEndDate.toISOString(),
          maxAllowedToAdd: maxAllowedToAdd,
          fees: Number(fees),
          feeStructure: tt.ticketingFees,
          ticketType: tt.ticketType,
          ticketQuanityLow: ticketQuanityLow,
        } as CheckoutTicket; // Ensure all properties align with CheckoutTicket type
      })
      .sort((a, b) => {
        // Treat tickets with maxAllowedToAdd > 0 as available and tickets with maxAllowedToAdd <= 0 as unavailable
        const aAvailable = a.maxAllowedToAdd > 0 ? 0 : 1;
        const bAvailable = b.maxAllowedToAdd > 0 ? 0 : 1;

        if (aAvailable !== bAvailable) {
          return aAvailable - bAvailable; // Available first
        }

        return a.price - b.price; // Then sort by price ascending
      });

    const responseData: CheckoutConfigResponse = {
      tickets: tickets,
    };

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error(
      `Error fetching checkout config for event ${eventId}:`,
      error
    );
    let errorMessage = 'Internal Server Error fetching checkout configuration.';
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(error);
    } else if (error instanceof Error) {
      console.error(error);
    }

    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
