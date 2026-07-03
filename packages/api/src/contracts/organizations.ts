import { z } from 'zod';
import { eventSummarySchema } from './events';

// --- OrganizationDetail -------------------------------------------------------
// The public organization-page DTO (/o/[slug]): brand header + the org's
// published events, split into upcoming and past. Socials are plain columns
// (instagram/twitter are usernames; linkedin/website are URLs — the web layer
// builds the final hrefs). Always public; no draft events ever reach here.

export const organizationDetailInputSchema = z.object({
  slug: z.string().min(1),
});
export type OrganizationDetailInput = z.infer<
  typeof organizationDetailInputSchema
>;

export const organizationDetailSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  /** Stored logo path (resolved to an absolute URL by the web layer). */
  logoUrl: z.string().nullable(),
  bio: z.string().nullable(),
  website: z.string().nullable(),
  instagram: z.string().nullable(),
  twitter: z.string().nullable(),
  linkedin: z.string().nullable(),
  verified: z.boolean(),
  /** Published, not-yet-ended events, soonest first. */
  upcomingEvents: z.array(eventSummarySchema),
  /** Published, already-ended events, most recent first. */
  pastEvents: z.array(eventSummarySchema),
});
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>;
