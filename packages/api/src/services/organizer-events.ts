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
    orderBy: { startsAt: 'desc' },
  });

  return rows.map((event) => toEventSummary(event, now));
}
