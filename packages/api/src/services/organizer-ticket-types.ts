/**
 * Screen E — the `/organizer/events/[id]/tickets` read.
 *
 * The event's ticket types, sales-first: what each one costs, how it's selling, where
 * it sits in its sale window, and what it has earned. Pure over an injected
 * `prisma`; authorization is the shared scope seam, with ownership as the
 * event's where clause.
 *
 * `sold` / `capacity` come from the ticket type's own counters — the one inventory
 * standard (availability = capacity - reserved - sold). Revenue is Σ of the
 * ticket type's completed-ticket subtotals, the same basis the event overview uses,
 * so the two screens report the same number.
 *
 * Read-only: create / edit / duplicate / delete still run through the existing
 * ticket actions; moving those behind this seam is a follow-up.
 */
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
        ticketTypes: {
          select: {
            id: true,
            name: true,
            price: true,
            priceCents: true,
            capacity: true,
            sold: true,
            saleStartsAt: true,
            saleEndsAt: true,
            ticketingFees: true,
          },
          // Natural creation order; reordering is deferred (UX plan).
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

  return {
    ticketTypes,
    summary: {
      sold: sum(ticketTypes, (ticketType) => ticketType.sold),
      capacity: sum(ticketTypes, (ticketType) => ticketType.capacity),
      revenueCents: sum(ticketTypes, (ticketType) => ticketType.revenueCents),
      onSale: ticketTypes.filter((t) => t.saleState === 'OnSale').length,
    },
  };
}

function buildTicketTypes(
  ticketTypes: {
    id: string;
    name: string;
    price: number;
    priceCents: number | null;
    capacity: number;
    sold: number;
    saleStartsAt: Date;
    saleEndsAt: Date;
    ticketingFees: TicketFeeStructure;
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
      // The card the event overview also renders — same shape, same basis.
      ...toTicketTypeBreakdown(ticketType, revenueByType),
      grossPriceCents,
      displayPriceCents: displayPriceOf(
        grossPriceCents,
        ticketType.ticketingFees
      ),
      saleState: getSaleState(ticketType, now),
      saleStartsAt: ticketType.saleStartsAt.toISOString(),
      saleEndsAt: ticketType.saleEndsAt.toISOString(),
    };
  });
}

/**
 * What the attendee is charged. `PASS_TICKET_FEES` adds the fee on top of the
 * organizer's price; `ABSORB_TICKET_FEES` leaves the price alone and takes the
 * fee out of the payout instead. A free type has no fee either way.
 */
function displayPriceOf(
  grossPriceCents: number,
  fees: TicketFeeStructure
): number {
  return fees === 'PASS_TICKET_FEES'
    ? grossPriceCents + calculateFeesCents(grossPriceCents)
    : grossPriceCents;
}

function sum<T>(items: T[], of: (item: T) => number): number {
  return items.reduce((total, item) => total + of(item), 0);
}
