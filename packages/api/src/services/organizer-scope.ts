/**
 * The organizer surface's authorization seam (ADR 0013).
 *
 * Access is **ownership-only** — no `ORGANIZER` role gate (ADR 0019). A read is
 * always scoped to exactly one organizer, so the old
 * `isPlatformOwner ? {} : { organizerUserId }` bypass has nowhere to live.
 *
 * View-as (ADR 0018) is the **one** place platform-owner power is spent: a
 * Platform Owner resolves the scope to another organizer, and from then on the
 * read is an ordinary single-organizer read. Nothing downstream re-checks for a
 * platform owner — an admin who wants an organizer's data views *as* them.
 * Writes never take a View-as target.
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { UnauthorizedError } from './_shared/errors';

/** Stopgap until a real admin role/grant lands (ADR 0013 successor). */
const PLATFORM_OWNER_EMAIL_SUFFIX = '@usetroptix.com';

/**
 * The organizer this read is scoped to — the actor, or a View-as target when
 * the actor is a Platform Owner. The platform-owner lookup is only paid for
 * when a View-as target is actually asked for, so the common read costs nothing.
 */
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

async function isPlatformOwner(
  prisma: PrismaClient,
  userId: string
): Promise<boolean> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email?.endsWith(PLATFORM_OWNER_EMAIL_SUFFIX) ?? false;
}
