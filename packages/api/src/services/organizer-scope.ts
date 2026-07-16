/**
 * The organizer surface's single authorization seam (ADR 0013).
 *
 * Access is **ownership-only** — there is no `ORGANIZER` role gate; anyone may
 * use the dashboard and sees exactly the events they own (ADR 0019). The old
 * `isPlatformOwner ? {} : { organizerUserId }` bypass is gone: a read is always
 * scoped to one organizer.
 *
 * A Platform Owner may point a **read** at another organizer via View-as
 * (ADR 0018). Writes never take a View-as target, so an admin can observe but
 * not mutate on an organizer's behalf.
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { UnauthorizedError } from './_shared/errors';

/** Stopgap until a real admin role/grant lands (ADR 0013 successor). */
const PLATFORM_OWNER_EMAIL_SUFFIX = '@usetroptix.com';

export interface OrganizerScope {
  /** The organizer this read is scoped to — the actor, or a View-as target. */
  organizerUserId: string;
  isPlatformOwner: boolean;
}

export async function resolveOrganizerScope(
  prisma: PrismaClient,
  actor: Actor,
  viewAsOrganizerUserId?: string
): Promise<OrganizerScope> {
  if (actor.kind !== 'user') {
    throw new UnauthorizedError('Sign in to use the organizer dashboard');
  }

  const user = await prisma.users.findUnique({
    where: { id: actor.userId },
    select: { email: true },
  });

  const isPlatformOwner =
    user?.email?.endsWith(PLATFORM_OWNER_EMAIL_SUFFIX) ?? false;

  // View-as is honored only for a Platform Owner; everyone else is pinned to
  // themselves, so passing someone else's id is a no-op rather than a leak.
  const organizerUserId =
    viewAsOrganizerUserId && isPlatformOwner
      ? viewAsOrganizerUserId
      : actor.userId;

  return { organizerUserId, isPlatformOwner };
}

/** For the `/admin` surface only (ADR 0018). */
export async function requirePlatformOwner(
  prisma: PrismaClient,
  actor: Actor
): Promise<OrganizerScope> {
  const scope = await resolveOrganizerScope(prisma, actor);
  if (!scope.isPlatformOwner) {
    throw new UnauthorizedError('Platform owners only');
  }
  return scope;
}

/**
 * Guards an event-scoped read: the actor must own the event, or be a Platform
 * Owner viewing it. Throws `NotFoundError` for a missing/soft-deleted event
 * before any ownership check leaks its existence.
 */
export function assertEventAccess(
  event: { organizerUserId: string },
  scope: OrganizerScope
): void {
  if (
    !scope.isPlatformOwner &&
    event.organizerUserId !== scope.organizerUserId
  ) {
    throw new UnauthorizedError('You do not have access to this event');
  }
}
