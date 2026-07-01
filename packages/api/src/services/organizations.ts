/**
 * Organization provisioning: lazy-create on first event, and the one-time
 * backfill that gives every existing organizer a brand.
 *
 * Prisma is injected (unit-testable, ADR 0013 — no authorization here). v1 is
 * "model for multi, expose one": each user owns exactly one Organization, keyed
 * by `ownerUserId` (== `Events.organizerUserId`). See
 * docs/plans/2026-06-event-spotlight-and-organizer-brand.md (2, 2b).
 */
import type { PrismaClient } from '@troptix/db';
import { generateUniqueSlug } from './_shared/slug';

type OrganizationRow = Awaited<
  ReturnType<PrismaClient['organization']['create']>
>;

const FALLBACK_NAME = 'Organizer';

/**
 * A unique slug for a new Organization. Loads existing slugs into a set and
 * defers to the pure `generateUniqueSlug`. Full-table read is fine at v1 scale
 * (few organizations); revisit if the table grows large.
 */
async function nextOrganizationSlug(
  prisma: PrismaClient,
  displayName: string
): Promise<string> {
  const existing = await prisma.organization.findMany({
    select: { slug: true },
  });
  const taken = new Set(existing.map((o) => o.slug));
  return generateUniqueSlug(displayName || FALLBACK_NAME, (s) => taken.has(s));
}

/**
 * The user's Organization, creating it on first need. Idempotent: returns the
 * existing org if the user already owns one (v1 exposes exactly one). Called on
 * first event save so ownership can be dual-written (`organizerUserId` ==
 * `ownerUserId`).
 */
export async function ensureOrganizationForUser(
  prisma: PrismaClient,
  { ownerUserId, displayName }: { ownerUserId: string; displayName: string }
): Promise<OrganizationRow> {
  const existing = await prisma.organization.findFirst({
    where: { ownerUserId },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  const slug = await nextOrganizationSlug(prisma, displayName);
  return prisma.organization.create({
    data: { ownerUserId, displayName: displayName || FALLBACK_NAME, slug },
  });
}

/**
 * One-time backfill: give every organizer of an existing event an Organization
 * and point their events at it. Idempotent — only touches events with a null
 * `organizationId` and reuses an org the user already owns. The display name is
 * taken from the user's most-recent event's `organizer` string.
 */
export async function backfillOrganizations(
  prisma: PrismaClient
): Promise<{ organizationsEnsured: number; eventsLinked: number }> {
  const events = await prisma.events.findMany({
    where: { organizationId: null },
    select: { organizerUserId: true, organizer: true },
    orderBy: { createdAt: 'desc' },
  });

  // Most-recent-first, so the first string seen per user is their newest.
  const nameByUser = new Map<string, string>();
  for (const e of events) {
    if (!nameByUser.has(e.organizerUserId)) {
      nameByUser.set(e.organizerUserId, e.organizer);
    }
  }

  let organizationsEnsured = 0;
  let eventsLinked = 0;
  // Array.from(...) so the for-of is over an array (apps/web compiles at es5,
  // where iterating a Map directly needs --downlevelIteration).
  for (const [ownerUserId, displayName] of Array.from(nameByUser.entries())) {
    const org = await ensureOrganizationForUser(prisma, {
      ownerUserId,
      displayName,
    });
    const { count } = await prisma.events.updateMany({
      where: { organizerUserId: ownerUserId, organizationId: null },
      data: { organizationId: org.id },
    });
    organizationsEnsured += 1;
    eventsLinked += count;
  }

  return { organizationsEnsured, eventsLinked };
}
