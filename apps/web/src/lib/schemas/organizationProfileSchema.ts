import { z } from 'zod';

// Profile Info editor (F6). Format/length only — reserved-slug and uniqueness
// are enforced server-side (updateOrganizationProfile → slug_invalid/slug_taken).
export const organizationProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { message: 'Brand name is required.' })
    .max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, { message: 'Profile URL must be at least 3 characters.' })
    .max(32, { message: 'Profile URL must be at most 32 characters.' })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message: 'Use lowercase letters, numbers, and single hyphens only.',
    }),
  /** Supabase Storage path (not a URL) for the logo, or '' for none. */
  logoUrl: z.string().max(2000).optional(),
  bio: z.string().max(600).optional(),
  website: z.string().max(200).optional(),
  instagram: z.string().max(60).optional(),
  twitter: z.string().max(60).optional(),
  linkedin: z.string().max(200).optional(),
});

export type OrganizationProfileValues = z.infer<
  typeof organizationProfileSchema
>;
