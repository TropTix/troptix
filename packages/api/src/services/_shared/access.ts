import type { MembershipRole, Prisma, PrismaClient } from '@troptix/db';
import { NotFoundError } from './errors';

/**
 * The one answer to "what may this role do" (ADR 0035). A new feature adds a
 * capability here and grants it to roles; call sites ask for the capability,
 * never for a role.
 */
export type Capability =
  | 'event.create'
  | 'event.edit'
  | 'event.checkIn'
  | 'event.orders'
  | 'organization.edit'
  | 'organization.payouts'
  | 'organization.members';

const ROLE_CAPABILITIES: Record<MembershipRole, readonly Capability[]> = {
  OWNER: [
    'event.create',
    'event.edit',
    'event.checkIn',
    'event.orders',
    'organization.edit',
    'organization.payouts',
    'organization.members',
  ],
  ADMIN: [
    'event.create',
    'event.edit',
    'event.checkIn',
    'event.orders',
    'organization.edit',
  ],
  SCANNER: ['event.checkIn'],
};

export function roleCan(role: MembershipRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function rolesWith(capability: Capability): MembershipRole[] {
  return (Object.keys(ROLE_CAPABILITIES) as MembershipRole[]).filter((role) =>
    roleCan(role, capability)
  );
}

export function organizationsWhereCan(
  userId: string,
  capability: Capability
): Prisma.OrganizationWhereInput {
  return {
    memberships: { some: { userId, role: { in: rolesWith(capability) } } },
  };
}

export function eventsWhereCan(
  userId: string,
  capability: Capability
): Prisma.EventsWhereInput {
  return {
    deletedAt: null,
    organization: organizationsWhereCan(userId, capability),
  };
}

/** The person's role on a live event, through its Organization; null if none. */
export async function findEventRole(
  prisma: PrismaClient,
  userId: string,
  eventId: string
): Promise<MembershipRole | null> {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      organization: { events: { some: { id: eventId, deletedAt: null } } },
    },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/**
 * NotFound, never Forbidden, so foreign ids can't be probed. The one home of
 * the event access rule — redefine here, not at call sites.
 */
export async function requireEventCapability(
  prisma: PrismaClient,
  userId: string,
  eventId: string,
  capability: Capability
): Promise<MembershipRole> {
  const role = await findEventRole(prisma, userId, eventId);
  if (!role || !roleCan(role, capability)) {
    throw new NotFoundError('Event not found');
  }
  return role;
}
