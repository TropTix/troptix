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
import { eventCardSelect, toEventSummary } from './_shared/organizerReads';
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
    select: eventCardSelect,
    // Newest first — a stable archive order. The client re-slices by status
    // chip and search, so this is only the default "All" ordering.
    orderBy: { startsAt: 'desc' },
  });

  return rows.map((event) => toEventSummary(event, now));
}
