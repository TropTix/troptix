'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import prisma from '@/server/prisma';
import { createOrganization, switchToOrganization } from '@troptix/api/server';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { userToActor } from '@/server/actor';

export async function setActingOrganization(formData: FormData) {
  const user = await getUserFromIdTokenCookie();
  if (!user) redirect('/auth/signin');
  const organizationId = String(formData.get('organizationId') ?? '');
  const switched = await switchToOrganization(
    prisma,
    userToActor(user),
    organizationId
  );
  if (switched) revalidatePath('/organizer', 'layout');
  redirect('/organizer');
}

export async function createOrganizationAction(formData: FormData) {
  const user = await getUserFromIdTokenCookie();
  if (!user) redirect('/auth/signin');
  const displayName = String(formData.get('displayName') ?? '');
  await createOrganization(prisma, userToActor(user), displayName);
  revalidatePath('/organizer', 'layout');
  redirect('/organizer');
}
