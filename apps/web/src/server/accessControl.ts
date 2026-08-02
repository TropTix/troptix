import prisma from './prisma';
import { notFound } from 'next/navigation';
import type { ServerUser } from './authUser';

/**
 * Legacy access helpers for the pages/routes not yet on the @troptix/api seam
 * (see docs/plans/2026-07-organizer-dashboard-migration.md). Platform Owner is
 * the explicit `Users.isPlatformOwner` grant carried on `ServerUser` — never
 * inferred from an email (ADR 0024).
 */
export function isPlatformOwner(
  user: Pick<ServerUser, 'isPlatformOwner'> | null | undefined
): boolean {
  return user?.isPlatformOwner ?? false;
}

/**
 * Whether the user may see this event: its owner, or a Platform Owner.
 */
export async function canAccessEvent(
  user: ServerUser,
  eventId: string
): Promise<boolean> {
  if (isPlatformOwner(user)) {
    return true;
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { organizerUserId: true },
  });

  if (!event) {
    return false;
  }

  return event.organizerUserId === user.uid;
}

/**
 * Verify event access and throw notFound() if unauthorized
 * This is a convenience function for pages that need to verify access
 */
export async function verifyEventAccess(
  user: ServerUser,
  eventId: string
): Promise<void> {
  const hasAccess = await canAccessEvent(user, eventId);
  if (!hasAccess) {
    notFound();
  }
}

/**
 * The event where-clause for the user: Platform Owners are unrestricted,
 * everyone else is scoped to the events they own.
 */
export function getEventWhereClause(user: ServerUser, eventId?: string): any {
  const baseWhere = eventId ? { id: eventId } : {};

  if (isPlatformOwner(user)) {
    return baseWhere;
  }

  return {
    ...baseWhere,
    organizerUserId: user.uid,
  };
}
