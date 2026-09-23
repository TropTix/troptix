/**
 * Ownership-only access (ADR 0019). View-as is the ONE place platform-owner
 * power is spent — nothing downstream re-checks, and writes never take it.
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { UnauthorizedError } from './_shared/errors';

export async function resolveOrganizerScope(
  prisma: PrismaClient,
  actor: Actor,
  viewAsOrganizerUserId?: string
): Promise<string> {
  if (actor.kind !== 'user') {
    throw new UnauthorizedError('Sign in to use the organizer dashboard');
  }

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
async function isPlatformOwner(
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
