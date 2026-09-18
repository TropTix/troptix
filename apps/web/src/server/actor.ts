import { redirect } from 'next/navigation';
import type { Actor } from '@troptix/api/server';
import { getServerUser, type ServerUser } from '@/server/authUser';

export function userToActor(user: ServerUser): Actor {
  return {
    kind: 'user',
    userId: user.uid,
    role: user.role ?? 'PATRON',
  };
}

export async function requireOrganizerActor(): Promise<Actor> {
  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }
  return userToActor(user);
}
