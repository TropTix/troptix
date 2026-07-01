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
import type { EventSummary } from '../contracts/events';
import type {
  OrganizationDetail,
  OrganizationDetailInput,
} from '../contracts/organizations';
import { generateUniqueSlug } from './_shared/slug';
import { toEventSummary } from './_shared/eventSummary';
import { NotFoundError } from './_shared/errors';

type OrganizationRow = Awaited<
  ReturnType<PrismaClient['organization']['create']>
>;

const FALLBACK_NAME = 'Organizer';

/** Every existing slug, as a set — the input to `generateUniqueSlug`. */
async function loadTakenSlugs(prisma: PrismaClient): Promise<Set<string>> {
  const rows = await prisma.organization.findMany({ select: { slug: true } });
  return new Set(rows.map((o) => o.slug));
}

/**
 * The user's Organization, creating it on first need. Idempotent: returns the
 * existing org if the user already owns one (v1 exposes exactly one). Called on
 * first event save so ownership can be dual-written (`organizerUserId` ==
 * `ownerUserId`).
 *
 * Pass `takenSlugs` when creating many orgs in a loop (the backfill) to avoid a
 * per-call full-table slug read; the new slug is added to it so later calls stay
 * unique. The DB `slug` unique constraint is the real concurrency backstop.
 */
export async function ensureOrganizationForUser(
  prisma: PrismaClient,
  { ownerUserId, displayName }: { ownerUserId: string; displayName: string },
  takenSlugs?: Set<string>
): Promise<OrganizationRow> {
  const existing = await prisma.organization.findFirst({
    where: { ownerUserId },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  const taken = takenSlugs ?? (await loadTakenSlugs(prisma));
  // trim() so a padded name is cleaned and a whitespace-only one falls back
  // (a bare `|| FALLBACK_NAME` treats "   " as a valid display name).
  const name = displayName.trim() || FALLBACK_NAME;
  const slug = generateUniqueSlug(name, (s) => taken.has(s));
  const org = await prisma.organization.create({
    data: { ownerUserId, displayName: name, slug },
  });
  taken.add(slug);
  return org;
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

  // One slug read for the whole backfill; ensureOrganizationForUser adds each
  // created slug to the set, keeping later iterations unique without re-reading.
  const takenSlugs = await loadTakenSlugs(prisma);

  let organizationsEnsured = 0;
  let eventsLinked = 0;
  // Array.from(...) so the for-of is over an array (apps/web compiles at es5,
  // where iterating a Map directly needs --downlevelIteration).
  for (const [ownerUserId, displayName] of Array.from(nameByUser.entries())) {
    const org = await ensureOrganizationForUser(
      prisma,
      { ownerUserId, displayName },
      takenSlugs
    );
    const { count } = await prisma.events.updateMany({
      where: { organizerUserId: ownerUserId, organizationId: null },
      data: { organizationId: org.id },
    });
    organizationsEnsured += 1;
    eventsLinked += count;
  }

  return { organizationsEnsured, eventsLinked };
}

/**
 * The public organization page read (/o/[slug]): brand header + the org's
 * published events, split into upcoming (soonest first) and past (most-recent
 * first). No authorization (ADR 0013) — always public; drafts are never included.
 */
export async function getOrganizationBySlug(
  prisma: PrismaClient,
  input: OrganizationDetailInput
): Promise<OrganizationDetail> {
  const org = await prisma.organization.findUnique({
    where: { slug: input.slug },
    select: {
      slug: true,
      displayName: true,
      logoUrl: true,
      bio: true,
      website: true,
      instagram: true,
      twitter: true,
      linkedin: true,
      verified: true,
      events: {
        where: { isDraft: false },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          startDate: true,
          endDate: true,
          venue: true,
          ticketTypes: {
            where: {
              OR: [
                { discountCode: { equals: null } },
                { discountCode: { equals: '' } },
              ],
            },
            select: { priceCents: true, price: true },
            orderBy: { price: 'asc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!org) {
    throw new NotFoundError(`Organization not found: ${input.slug}`);
  }

  const now = Date.now();
  const upcomingEvents: EventSummary[] = [];
  const pastEvents: EventSummary[] = [];
  for (const event of org.events) {
    const bucket = event.endDate.getTime() > now ? upcomingEvents : pastEvents;
    bucket.push(toEventSummary(event));
  }
  pastEvents.reverse(); // fetched startDate asc → most-recent past first

  return {
    slug: org.slug,
    displayName: org.displayName,
    logoUrl: org.logoUrl,
    bio: org.bio,
    website: org.website,
    instagram: org.instagram,
    twitter: org.twitter,
    linkedin: org.linkedin,
    verified: org.verified,
    upcomingEvents,
    pastEvents,
  };
}
