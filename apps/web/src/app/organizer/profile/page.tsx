import { redirect } from 'next/navigation';
import prisma from '@/server/prisma';
import { findOrganizationForOwner } from '@troptix/api/server';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import OrganizationProfileForm from './_components/OrganizationProfileForm';

export const metadata = { title: 'Organizer Profile' };

// Profile Info editor (F6). Read-only on GET: viewing this page must not create
// an Organization — one org per owner is a DB invariant (teams Phase 0,
// ADR 0022), and once Memberships land a member browsing here must not acquire
// an org of their own. A first-time organizer sees the empty form; their
// Organization is created on explicit save (saveOrganizationProfile).
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
