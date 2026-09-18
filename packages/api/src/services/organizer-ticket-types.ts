// Revenue is Σ the ticket type's completed-ticket subtotals — the same basis
// the event overview uses, so the two screens report the same number.
import type { PrismaClient, TicketFeeStructure } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  TicketTypeRow,
  TicketTypesView,
  ViewAsInput,
} from '../contracts/organizer';
import { NotFoundError } from './_shared/errors';
import { calculateFeesCents } from './_shared/fees';
import { toCents } from './_shared/organizerMapping';
import {
  revenueCentsByTicketType,
  ticketTypeRollupQuery,
  toTicketTypeBreakdown,
  type TicketTypeRollupRow,
} from './_shared/organizerReads';
import { getSaleState } from './_shared/saleState';
import { resolveOrganizerScope } from './organizer-scope';

export async function listTicketTypes(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  input: ViewAsInput = {},
  now: Date = new Date()
): Promise<TicketTypesView> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );

  const [event, rollups] = await Promise.all([
    prisma.events.findFirst({
      where: { id: eventId, organizerUserId, deletedAt: null },
      select: {
        id: true,
        endsAt: true,
        ticketTypes: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            priceCents: true,
            capacity: true,
            sold: true,
            maxPurchasePerUser: true,
            saleStartsAt: true,
            saleEndsAt: true,
            ticketingFees: true,
            discountCode: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),

    prisma.tickets.groupBy(ticketTypeRollupQuery(eventId)),
  ]);

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  const ticketTypes = buildTicketTypes(event.ticketTypes, rollups, now);

  const summary = ticketTypes.reduce(
    (acc, ticketType) => {
      acc.sold += ticketType.sold;
      acc.capacity += ticketType.capacity;
      acc.revenueCents += ticketType.revenueCents;
      if (ticketType.saleState === 'OnSale') acc.onSale += 1;
      return acc;
    },
    { sold: 0, capacity: 0, revenueCents: 0, onSale: 0 }
  );

  return { eventEndsAt: event.endsAt.toISOString(), ticketTypes, summary };
}

function buildTicketTypes(
  ticketTypes: {
    id: string;
    name: string;
    description: string;
    price: number;
    priceCents: number | null;
    capacity: number;
    sold: number;
    maxPurchasePerUser: number;
    saleStartsAt: Date;
    saleEndsAt: Date;
    ticketingFees: TicketFeeStructure;
    discountCode: string | null;
  }[],
  rollups: TicketTypeRollupRow[],
  now: Date
): TicketTypeRow[] {
  const revenueByType = revenueCentsByTicketType(rollups);

  return ticketTypes.map((ticketType) => {
    // Prefer the integer-cents column; fall back to the legacy float for ticket
    // types written before that cutover (roadmap 2.12).
    const grossPriceCents = ticketType.priceCents ?? toCents(ticketType.price);

    return {
      ...toTicketTypeBreakdown(ticketType, revenueByType),
      grossPriceCents,
      displayPriceCents: displayPriceOf(
        grossPriceCents,
        ticketType.ticketingFees
      ),
      saleState: getSaleState(ticketType, now),
      saleStartsAt: ticketType.saleStartsAt.toISOString(),
      saleEndsAt: ticketType.saleEndsAt.toISOString(),
      description: ticketType.description,
      maxPurchasePerUser: ticketType.maxPurchasePerUser,
      ticketingFees: ticketType.ticketingFees,
      discountCode: ticketType.discountCode,
    };
  });
}

function displayPriceOf(
  grossPriceCents: number,
  fees: TicketFeeStructure
): number {
  return fees === 'PASS_TICKET_FEES'
    ? grossPriceCents + calculateFeesCents(grossPriceCents)
    : grossPriceCents;
}
