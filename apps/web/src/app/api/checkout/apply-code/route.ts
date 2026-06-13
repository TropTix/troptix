// app/api/checkout/apply-code/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { OrderStatus, Prisma, TicketFeeStructure } from '@troptix/db';
import { calculateFees } from '@/lib/fees'; // Make sure this utility is available
import { CheckoutTicket } from '@/types/checkout'; // Import your types (CheckoutConfigResponse isn't directly returned here)

export async function POST(req: NextRequest): Promise<
  NextResponse<
    | {
        message: string;
        type: 'password';
        isValid: boolean;
        unlockedTicket?: CheckoutTicket;
      }
    | { message: string; type: 'invalid' }
  >
> {
  try {
    const { eventId, code } = await req.json();

    if (!eventId || typeof eventId !== 'string') {
      return NextResponse.json(
        { message: 'Missing or invalid "eventId".', type: 'invalid' },
        { status: 400 }
      );
    }
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { message: 'Missing or invalid "code".', type: 'invalid' },
        { status: 400 }
      );
    }

    const matchedTicketTypeData = await prisma.ticketTypes.findFirst({
      where: {
        eventId: eventId,
        discountCode: {
          equals: code,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        discountCode: true, // Needed for comparison
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
          // Needed for isDraft
          select: {
            isDraft: true,
          },
        },
        _count: {
          // Needed for stock calculation
          select: {
            tickets: { where: { order: { status: OrderStatus.COMPLETED } } },
          },
        },
        tickets: {
          // Needed for pending orders stock calculation
          where: { order: { status: OrderStatus.PENDING } },
          select: { id: true },
        },
      },
    });

    if (matchedTicketTypeData) {
      const now = new Date();
      const completedOrdersCount = matchedTicketTypeData._count.tickets;
      const pendingOrdersCount = matchedTicketTypeData.tickets.length;
      const stock = Math.max(
        0,
        matchedTicketTypeData.quantity -
          completedOrdersCount -
          pendingOrdersCount
      );
      const saleIsActive =
        now >= matchedTicketTypeData.saleStartDate &&
        now <= matchedTicketTypeData.saleEndDate;
      const isDraft = matchedTicketTypeData.event.isDraft;

      const maxAllowedToAdd =
        saleIsActive && !isDraft
          ? Math.max(
              0,
              Math.min(stock, matchedTicketTypeData.maxPurchasePerUser)
            )
          : 0;
      const ticketQuanityLow = stock > 0 && stock < 10;
      const fees =
        matchedTicketTypeData.ticketingFees ===
        TicketFeeStructure.PASS_TICKET_FEES
          ? calculateFees(matchedTicketTypeData.price)
          : 0;

      const unlockedTicket: CheckoutTicket = {
        id: matchedTicketTypeData.id,
        name: matchedTicketTypeData.name,
        description: matchedTicketTypeData.description,
        price: Number(matchedTicketTypeData.price),
        saleStartDate: matchedTicketTypeData.saleStartDate.toISOString(),
        saleEndDate: matchedTicketTypeData.saleEndDate.toISOString(),
        maxAllowedToAdd: maxAllowedToAdd,
        fees: Number(fees),
        feeStructure: matchedTicketTypeData.ticketingFees,
        ticketType: matchedTicketTypeData.ticketType,
        ticketQuanityLow: ticketQuanityLow,
        isPasswordProtected: true,
      };

      return NextResponse.json(
        {
          message: `Code applied successfully. "${unlockedTicket.name}" is now available.`,
          type: 'password',
          isValid: true,
          unlockedTicket: unlockedTicket,
        },
        { status: 200 }
      );
    }

    // If no matching ticket type was found with that password
    return NextResponse.json(
      { message: 'Invalid code.', type: 'invalid' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Error applying code:', error);
    let errorMessage = 'Internal Server Error applying code.';
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(error);
    } else if (error instanceof Error) {
      console.error(error);
    }
    return NextResponse.json(
      { message: errorMessage, type: 'invalid' },
      { status: 500 }
    );
  }
}
