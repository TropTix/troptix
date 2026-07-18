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
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  TicketTypeRow,
  TicketTypesView,
  ViewAsInput,
} from '../contracts/organizer';
import { NotFoundError } from './_shared/errors';
import { toCents } from './_shared/organizerMapping';
import { getSaleState } from './_shared/saleState';
import { resolveOrganizerScope } from './organizer-scope';

/** Per-ticketType `_sum.subtotal` from the completed-ticket rollup. */
interface TicketTypeRollup {
  ticketTypeId: string | null;
  _sum: { subtotal: number | null };
}

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

  const [event, revenueRollups] = await Promise.all([
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
          },
          // Natural creation order; reordering is deferred (UX plan).
          orderBy: { createdAt: 'asc' },
        },
      },
    }),

    prisma.tickets.groupBy({
      by: ['ticketTypeId'],
      where: { eventId, order: { status: 'COMPLETED' } },
      _sum: { subtotal: true },
    }),
  ]);

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  const ticketTypes = buildTicketTypes(event.ticketTypes, revenueRollups, now);

  return {
    ticketTypes,
    summary: {
      sold: sum(ticketTypes, (ticketType) => ticketType.sold),
      capacity: sum(ticketTypes, (ticketType) => ticketType.capacity),
      revenueCents: sum(ticketTypes, (ticketType) => ticketType.revenueCents),
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
  }[],
  rollups: TicketTypeRollup[],
  now: Date
): TicketTypeRow[] {
  const revenueByType = new Map(
    rollups.map((row) => [row.ticketTypeId, row._sum.subtotal])
  );

  return ticketTypes.map((ticketType) => ({
    id: ticketType.id,
    name: ticketType.name,
    // Prefer the integer-cents column; fall back to the legacy float for ticket types
    // written before that cutover (roadmap 2.12).
    priceCents: ticketType.priceCents ?? toCents(ticketType.price),
    sold: ticketType.sold,
    capacity: ticketType.capacity,
    revenueCents: toCents(revenueByType.get(ticketType.id)),
    saleState: getSaleState(ticketType, now),
  }));
}

function sum<T>(items: T[], of: (item: T) => number): number {
  return items.reduce((total, item) => total + of(item), 0);
}
