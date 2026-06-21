import prisma from './prisma';
import { notFound } from 'next/navigation';

/**
 * Check if an email belongs to a platform owner
 */
export function isPlatformOwner(email: string | undefined): boolean {
  if (!email) return false;
  return email.endsWith('@usetroptix.com');
}

/**
 * Check if a user can access a specific event
 * Returns true if:
 * 1. User is the event creator, OR
 * 2. User has a @usetroptix.com email (platform owner)
 */
export async function canAccessEvent(
  userId: string,
  userEmail: string | undefined,
  eventId: string
): Promise<boolean> {
  // Platform owners have access to all events
  if (isPlatformOwner(userEmail)) {
    return true;
  }

  // Check if user is the event creator
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { organizerUserId: true },
  });

  if (!event) {
    return false;
  }

  return event.organizerUserId === userId;
}

/**
 * Verify event access and throw notFound() if unauthorized
 * This is a convenience function for pages that need to verify access
 */
export async function verifyEventAccess(
  userId: string,
  userEmail: string | undefined,
  eventId: string
): Promise<void> {
  const hasAccess = await canAccessEvent(userId, userEmail, eventId);
  if (!hasAccess) {
    notFound();
  }
}

/**
 * Get the appropriate where clause for event queries based on user permissions
 * Platform owners get no restrictions, regular users get organizerUserId filter
 */
export function getEventWhereClause(
  userId: string,
  userEmail: string | undefined,
  eventId?: string
): any {
  const baseWhere = eventId ? { id: eventId } : {};

  // Platform owners can see all events
  if (isPlatformOwner(userEmail)) {
    return baseWhere;
  }

  // Regular users can only see their own events
  return {
    ...baseWhere,
    organizerUserId: userId,
  };
}

/**
 * Check if user has platform owner privileges for UI display purposes
 */
export function hasPlatformAccess(userEmail: string | undefined): boolean {
  return isPlatformOwner(userEmail);
}
