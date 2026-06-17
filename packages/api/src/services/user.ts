import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';

export async function getProfile(prisma: PrismaClient, actor: Actor) {
  if (actor.kind !== 'user') {
    throw new Error('UNAUTHORIZED');
  }

  const user = await prisma.users.findUnique({
    where: { id: actor.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      stripeId: true,
    },
  });

  if (!user) {
    throw new Error('NOT_FOUND');
  }

  return user;
}
