import { redirect } from 'next/navigation';
import {
  resolveOrganizerScope,
  type Actor,
  type OrganizerScope,
} from '@troptix/api/server';
import prisma from '@/server/prisma';
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

export async function resolveActingScope(
  user: ServerUser
): Promise<OrganizerScope> {
  return resolveOrganizerScope(prisma, userToActor(user));
}
