import { redirect } from 'next/navigation';
import prisma from '@/server/prisma';
import { findOrganizationForOwner } from '@troptix/api/server';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import OrganizationProfileForm from './_components/OrganizationProfileForm';

export const metadata = { title: 'Organizer Profile' };

// Read-only on GET: viewing must not create an Organization (ADR 0022) — a
// first-time organizer sees the empty form; the org is created on save.
export default async function OrganizerProfilePage() {
  const user = await getUserFromIdTokenCookie();
  if (!user) redirect('/auth/signin');

  const org = await findOrganizationForOwner(prisma, user.uid);

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
