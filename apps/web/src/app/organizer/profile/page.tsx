import { redirect } from 'next/navigation';
import prisma from '@/server/prisma';
import { findActingOrganization } from '@troptix/api/server';
import { userToActor } from '@/server/actor';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import OrganizationProfileForm from './_components/OrganizationProfileForm';

export const metadata = { title: 'Organizer Profile' };

// Viewing must not create an Organization (ADR 0022) — the org is created on save.
export default async function OrganizerProfilePage() {
  const user = await getUserFromIdTokenCookie();
  if (!user) redirect('/auth/signin');

  const org = await findActingOrganization(prisma, userToActor(user));

  return (
    <OrganizationProfileForm
      initial={{
        displayName: org?.displayName ?? '',
        slug: org?.slug ?? '',
        logoUrl: org?.logoUrl ?? '',
        bio: org?.bio ?? '',
        website: org?.website ?? '',
        instagram: org?.instagram ?? '',
        twitter: org?.twitter ?? '',
        linkedin: org?.linkedin ?? '',
      }}
    />
  );
}
