import { redirect } from 'next/navigation';
import type { Actor } from '@troptix/api/server';
import { getServerUser, type ServerUser } from '@/server/authUser';

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

/**
 * The organizer-surface page preamble in one call: resolve the signed-in user,
 * bounce to sign-in if there isn't one, and hand back the `actor`. `redirect`
 * throws, so the return type is a plain `Actor` — callers never see null.
 */
export async function requireOrganizerActor(): Promise<Actor> {
  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }
  return userToActor(user);
}
