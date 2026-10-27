// Organizations are lazy-created on first explicit write (event save or
// profile save) — never on a page view.
import type { PrismaClient } from '@troptix/db';
import type { EventSummary } from '../contracts/events';
import type {
  OrganizationDetail,
  OrganizationDetailInput,
} from '../contracts/organizations';
import { generateUniqueSlug, isValidSlug } from './_shared/slug';
import { publicEventsWhere } from './_shared/publicEvents';
import { toEventSummary } from './_shared/eventSummary';
import { NotFoundError, UnauthorizedError } from './_shared/errors';
import { resolveOrganizerScope } from './organizer-scope';
import type { Actor } from '../trpc/context';

type OrganizationRow = Awaited<
  ReturnType<PrismaClient['organization']['create']>
>;

const FALLBACK_NAME = 'Organizer';

async function loadTakenSlugs(prisma: PrismaClient): Promise<Set<string>> {
  const rows = await prisma.organization.findMany({ select: { slug: true } });
  return new Set(rows.map((o) => o.slug));
}

export function findOrganizationForOwner(
  prisma: PrismaClient,
  ownerUserId: string
) {
  return prisma.organization.findFirst({
    where: { ownerUserId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function ensureOrganizationForUser(
  prisma: PrismaClient,
  { ownerUserId, displayName }: { ownerUserId: string; displayName: string }
): Promise<OrganizationRow> {
  const existing = await findOrganizationForOwner(prisma, ownerUserId);
  if (existing) return existing;

  const taken = await loadTakenSlugs(prisma);
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

export async function updateOrganizationProfile(
  prisma: PrismaClient,
  actor: Actor,
  input: UpdateOrganizationProfileInput
): Promise<UpdateOrganizationProfileResult> {
  const scope = await resolveOrganizerScope(prisma, actor);
  const org = scope.organizationId
    ? await prisma.organization.findUnique({
        where: { id: scope.organizationId },
      })
    : null;

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
    } else if (!scope.organizationId) {
      await prisma.organization.create({
        data: { ownerUserId: scope.userId, ...data },
      });
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return { ok: false, reason: 'slug_taken' };
    }
    throw err;
  }

  return { ok: true, slug: nextSlug };
}

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
  pastEvents.reverse();

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

export async function findActingOrganization(
  prisma: PrismaClient,
  actor: Actor
) {
  const scope = await resolveOrganizerScope(prisma, actor);
  return scope.organizationId
    ? prisma.organization.findUnique({ where: { id: scope.organizationId } })
    : null;
}

export function listOwnedOrganizations(prisma: PrismaClient, actor: Actor) {
  if (actor.kind !== 'user') {
    throw new UnauthorizedError('Sign in to switch organizations');
  }
  return prisma.organization.findMany({
    where: { ownerUserId: actor.userId },
    select: { id: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createOrganization(
  prisma: PrismaClient,
  actor: Actor,
  displayName: string
): Promise<OrganizationRow> {
  if (actor.kind !== 'user') {
    throw new UnauthorizedError('Sign in to create an organization');
  }
  const name = displayName.trim() || FALLBACK_NAME;
  const taken = await loadTakenSlugs(prisma);
  const slug = generateUniqueSlug(name, (s) => taken.has(s));
  return prisma.organization.create({
    data: { displayName: name, slug, ownerUserId: actor.userId },
  });
}

/** Makes an owned Organization the default the next time the dashboard opens. */
export async function switchToOrganization(
  prisma: PrismaClient,
  actor: Actor,
  organizationId: string
): Promise<boolean> {
  if (actor.kind !== 'user') return false;
  const owned = await prisma.organization.updateMany({
    where: { id: organizationId, ownerUserId: actor.userId },
    data: { updatedAt: new Date() },
  });
  return owned.count === 1;
}
