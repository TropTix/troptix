import type { Actor } from '@troptix/api/server';
import type { ServerUser } from '@/server/authUser';

/**
 * The signed-in user as the `actor` the services authorize on (ADR 0013). One
 * helper so no page hand-rolls the shape — and so there is a single place to
 * change when the actor grows (e.g. the role×permission matrix).
 */
export function userToActor(user: ServerUser): Actor {
  return {
    kind: 'user',
    userId: user.uid,
    role: user.role ?? 'PATRON',
  };
}
