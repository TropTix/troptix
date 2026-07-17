/**
 * Screen B — the `/organizer/events` list read.
 *
 * Every event the organizer owns, at every status (active, upcoming, past,
 * draft), shaped as the same card the dashboard uses. The status filter and
 * search live in the client — this read returns the whole archive in one stable
 * order and lets the UI slice it, so filtering never costs a round-trip.
 *
 * Pure over an injected `prisma`; authorization is the shared scope seam.
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  OrganizerEventSummary,
  ViewAsInput,
} from '../contracts/organizer';
import { getEventStatus } from './_shared/eventStatus';
import { capacityOf } from './_shared/organizerMapping';
import { resolveOrganizerScope } from './organizer-scope';

export async function listOrganizerEvents(
  prisma: PrismaClient,
  actor: Actor,
  input: ViewAsInput = {},
  now: Date = new Date()
): Promise<OrganizerEventSummary[]> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );

  const rows = await prisma.events.findMany({
    where: { organizerUserId, deletedAt: null },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      isDraft: true,
      startsAt: true,
      endsAt: true,
      ticketTypes: { select: { capacity: true, quantity: true } },
      _count: {
        select: { tickets: { where: { order: { status: 'COMPLETED' } } } },
      },
    },
    // Newest first — a stable archive order. The client re-slices by status
    // chip and search, so this is only the default "All" ordering.
    orderBy: { startsAt: 'desc' },
  });

  return rows.map((event) => ({
    id: event.id,
    name: event.name,
    imageUrl: event.imageUrl ?? null,
    startsAt: event.startsAt.toISOString(),
    sold: event._count.tickets,
    capacity: event.ticketTypes.reduce(
      (total, tier) => total + capacityOf(tier),
      0
    ),
    status: getEventStatus(event, now),
  }));
}
