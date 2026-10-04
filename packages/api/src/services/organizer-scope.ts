/**
 * Ownership-only access (ADR 0019). View-as is the ONE place platform-owner
 * power is spent — nothing downstream re-checks, and writes never take it.
 */
import type { Prisma, PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { UnauthorizedError } from './_shared/errors';

/** Who the organizer pages act for, and which of their Organizations they are scoped to. */
export type OrganizerScope = {
  userId: string;
  organizationId: string | null;
};

function matchesNothing(): { id: { in: string[] } } {
  return { id: { in: [] } };
}

export function eventsInScope(scope: OrganizerScope): Prisma.EventsWhereInput {
  return scope.organizationId
    ? { organizationId: scope.organizationId, deletedAt: null }
    : { ...matchesNothing(), deletedAt: null };
}

export function organizationInScope(
  scope: OrganizerScope
): Prisma.OrganizationWhereInput {
  return scope.organizationId ? { id: scope.organizationId } : matchesNothing();
}

export async function resolveOrganizerScope(
  prisma: PrismaClient,
  actor: Actor,
  viewAsOrganizerUserId?: string
): Promise<OrganizerScope> {
  if (actor.kind !== 'user') {
    throw new UnauthorizedError('Sign in to use the organizer dashboard');
  }

  const userId = await scopedUserId(prisma, actor, viewAsOrganizerUserId);
  const owned = await prisma.organization.findMany({
    where: { ownerUserId: userId },
    select: {
      id: true,
      updatedAt: true,
      events: {
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  });

  return { userId, organizationId: lastTouchedId(owned) };
}

/** The org touched most recently: its own edit, or an edit to one of its events. */
function lastTouchedId(
  orgs: {
    id: string;
    updatedAt: Date;
    events: { updatedAt: Date }[];
  }[]
): string | null {
  let best: { id: string; touched: number } | null = null;
  for (const org of orgs) {
    const touched = Math.max(
      org.updatedAt.getTime(),
      ...org.events.map((event) => event.updatedAt.getTime())
    );
    if (!best || touched > best.touched) best = { id: org.id, touched };
  }
  return best?.id ?? null;
}

async function scopedUserId(
  prisma: PrismaClient,
  actor: { userId: string },
  viewAsOrganizerUserId?: string
): Promise<string> {
  if (!viewAsOrganizerUserId || viewAsOrganizerUserId === actor.userId) {
    return actor.userId;
  }

  // Asking to view as someone else is a no-op unless you're a Platform Owner —
  // never an error, so this can't be used to probe who is one.
  return (await isPlatformOwner(prisma, actor.userId))
    ? viewAsOrganizerUserId
    : actor.userId;
}

/** The explicit grant (`Users.isPlatformOwner`, ADR 0022) — never an email. */
export async function isPlatformOwner(
  prisma: PrismaClient,
  userId: string
): Promise<boolean> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { isPlatformOwner: true },
  });
  return user?.isPlatformOwner ?? false;
}

/**
 * The Platform View gate for service-layer reads and writes. The one other
 * spend of the grant is View-as above — keep every check on this module so
 * the grant has a single implementation.
 */
export async function requirePlatformOwner(
  prisma: PrismaClient,
  actor: Actor
): Promise<string> {
  if (actor.kind !== 'user' || !(await isPlatformOwner(prisma, actor.userId))) {
    throw new UnauthorizedError();
  }
  return actor.userId;
}
