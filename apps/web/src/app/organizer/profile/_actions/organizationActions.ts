'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import prisma from '@/server/prisma';
import { updateOrganizationProfile } from '@troptix/api/server';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import {
  organizationProfileSchema,
  OrganizationProfileValues,
} from '@/lib/schemas/organizationProfileSchema';

interface ActionResult {
  success: boolean;
  slug?: string;
  error?: string;
}

export async function saveOrganizationProfile(
  formData: OrganizationProfileValues
): Promise<ActionResult> {
  const parsed = organizationProfileSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'Invalid profile data.',
    };
  }

  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
    return { success: false, error: 'Authentication required.' };
  }

  const d = parsed.data;
  const result = await updateOrganizationProfile(prisma, {
    ownerUserId: user.uid,
    displayName: d.displayName,
    slug: d.slug,
    bio: d.bio ?? null,
    website: d.website ?? null,
    instagram: d.instagram ?? null,
    twitter: d.twitter ?? null,
    linkedin: d.linkedin ?? null,
  });

  if (!result.ok) {
    const error =
      result.reason === 'slug_taken'
        ? 'That profile URL is already taken.'
        : result.reason === 'slug_invalid'
          ? 'That profile URL isn’t valid.'
          : 'Organization not found.';
    return { success: false, error };
  }

  revalidatePath('/organizer/profile');
  revalidatePath(`/o/${result.slug}`);
  return { success: true, slug: result.slug };
}
