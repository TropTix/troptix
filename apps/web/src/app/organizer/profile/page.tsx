import { redirect } from 'next/navigation';
import prisma from '@/server/prisma';
import { ensureOrganizationForUser } from '@troptix/api/server';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import OrganizationProfileForm from './_components/OrganizationProfileForm';

export const metadata = { title: 'Organizer Profile' };

// Profile Info editor (F6). Ensures the caller's Organization exists so the
// editor always has something to edit — a new organizer may not have created an
// event yet (default name = their email; they rename it here).
export default async function OrganizerProfilePage() {
  const user = await getUserFromIdTokenCookie();
  if (!user) redirect('/auth/signin');

  const org = await ensureOrganizationForUser(prisma, {
    ownerUserId: user.uid,
    displayName: user.email ?? '',
  });

  return (
    <OrganizationProfileForm
      initial={{
        displayName: org.displayName,
        slug: org.slug,
        bio: org.bio ?? '',
        website: org.website ?? '',
        instagram: org.instagram ?? '',
        twitter: org.twitter ?? '',
        linkedin: org.linkedin ?? '',
      }}
    />
  );
}
