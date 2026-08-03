/**
 * Organization provisioning: lazy-create on first explicit write (event save or
 * profile save — never on a page view).
 *
 * Prisma is injected (unit-testable, ADR 0013 — no authorization here). Each
 * user owns exactly one Organization, keyed by `ownerUserId`
 * (== `Events.organizerUserId`) and enforced by a unique index (ADR 0022). See
 * docs/plans/2026-06-event-spotlight-and-organizer-brand.md (2, 2b).
 */
import type { PrismaClient } from '@troptix/db';
import type { EventSummary } from '../contracts/events';
import type {
  OrganizationDetail,
  OrganizationDetailInput,
} from '../contracts/organizations';
import { generateUniqueSlug, isValidSlug } from './_shared/slug';
import { publicEventsWhere } from './_shared/publicEvents';
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
 * Read-only: the user's Organization, or null before their first write.
 * Oldest wins — the same pick `ensureOrganizationForUser` makes — so every
 * gate and UI read resolves the same org.
 */
export function findOrganizationForOwner(
  prisma: PrismaClient,
  ownerUserId: string
) {
  return prisma.organization.findFirst({
    where: { ownerUserId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * The user's Organization, created on first need with a generated slug.
 * Idempotent. Event-save path only — the profile save creates via
 * `updateOrganizationProfile` with the user's chosen slug instead.
 */
export async function ensureOrganizationForUser(
  prisma: PrismaClient,
  { ownerUserId, displayName }: { ownerUserId: string; displayName: string }
): Promise<OrganizationRow> {
  const existing = await findOrganizationForOwner(prisma, ownerUserId);
  if (existing) return existing;

  const taken = await loadTakenSlugs(prisma);
  // trim() so a padded name is cleaned and a whitespace-only one falls back
  // (a bare `|| FALLBACK_NAME` treats "   " as a valid display name).
  const name = displayName.trim() || FALLBACK_NAME;
  const slug = generateUniqueSlug(name, (s) => taken.has(s));
  try {
    return await prisma.organization.create({
      data: { ownerUserId, displayName: name, slug },
    });
  } catch (err) {
    // ownerUserId is unique (one org per owner): a concurrent ensure lost the
    // race — the winner's row is the org. Slug collisions rethrow.
    if ((err as { code?: string }).code === 'P2002') {
      const winner = await findOrganizationForOwner(prisma, ownerUserId);
      if (winner) return winner;
    }
    throw err;
  }
}

export type UpdateOrganizationProfileInput = {
  ownerUserId: string;
  displayName: string;
  slug: string;
  logoUrl: string | null;
  bio: string | null;
  website: string | null;
  instagram: string | null;
  twitter: string | null;
  linkedin: string | null;
};

export type UpdateOrganizationProfileResult =
  | { ok: true; slug: string }
  | { ok: false; reason: 'slug_invalid' | 'slug_taken' };

const blankToNull = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/**
 * Save the Organization brand (Profile Info editor, F6) — create-or-update.
 * Validation runs before any write, so a rejected slug never leaves a
 * half-created Organization behind. The unique indexes are the backstop:
 * a slug race maps to `slug_taken`; losing the owner race retries as update.
 */
export async function updateOrganizationProfile(
  prisma: PrismaClient,
  input: UpdateOrganizationProfileInput
): Promise<UpdateOrganizationProfileResult> {
  const org = await findOrganizationForOwner(prisma, input.ownerUserId);

  const nextSlug = input.slug.trim().toLowerCase();
  if (nextSlug !== org?.slug) {
    if (!isValidSlug(nextSlug)) return { ok: false, reason: 'slug_invalid' };
    const taken = await prisma.organization.findUnique({
      where: { slug: nextSlug },
    });
    if (taken && taken.id !== org?.id)
      return { ok: false, reason: 'slug_taken' };
  }

  const data = {
    displayName:
      input.displayName.trim() || (org?.displayName ?? FALLBACK_NAME),
    slug: nextSlug,
    logoUrl: blankToNull(input.logoUrl),
    bio: blankToNull(input.bio),
    website: blankToNull(input.website),
    instagram: blankToNull(input.instagram),
    twitter: blankToNull(input.twitter),
    linkedin: blankToNull(input.linkedin),
  };

  try {
    if (org) {
      await prisma.organization.update({ where: { id: org.id }, data });
    } else {
      // Owner-only today. Phase 1 must scope this to the acting Organization
      // before Admins get the form, or an Admin's first save mints them an org.
      await prisma.organization.create({
        data: { ownerUserId: input.ownerUserId, ...data },
      });
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      // Two uniques can fire. Losing the one-org-per-owner race means a
      // concurrent first save won — its row exists now, so retry as an update.
      // Otherwise it's the slug race, and the index is the arbiter.
      if (!org) {
        const winner = await findOrganizationForOwner(
          prisma,
          input.ownerUserId
        );
        if (winner) return updateOrganizationProfile(prisma, input);
      }
      return { ok: false, reason: 'slug_taken' };
    }
    throw err;
  }

  return { ok: true, slug: nextSlug };
}

/**
 * The public organization page read (/o/[slug]): brand header + the org's
 * published events, split into upcoming (soonest first) and past (most-recent
 * first). No authorization (ADR 0013) — always public; drafts and private
 * events are never included.
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
        where: publicEventsWhere,
        orderBy: { startsAt: 'asc' },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          startsAt: true,
          endsAt: true,
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
    const bucket = event.endsAt.getTime() > now ? upcomingEvents : pastEvents;
    bucket.push(toEventSummary(event));
  }
  pastEvents.reverse(); // fetched startsAt asc → most-recent past first

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
