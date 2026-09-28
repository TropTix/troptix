import type { MembershipRole } from '@troptix/db';

/**
 * For fake Prisma clients: whether a where built by `eventsWhereCan` admits a
 * live event whose Organization gives `userId` the role `role`.
 */
export function eventWhereAdmits(
  where: any,
  event: { deletedAt?: Date | null },
  userId: string,
  role: MembershipRole = 'OWNER'
): boolean {
  const some = where?.organization?.memberships?.some;
  return (
    !!some &&
    some.userId === userId &&
    some.role.in.includes(role) &&
    where.deletedAt === null &&
    (event.deletedAt ?? null) === null
  );
}

/** The user id an `eventsWhereCan` where was built for. */
export function whereUserId(where: any): string | undefined {
  return where?.organization?.memberships?.some?.userId;
}
