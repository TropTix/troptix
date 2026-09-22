import { z } from 'zod';
import { eventSummarySchema } from './events';

// Public DTO — no draft events may ever reach it. Socials: instagram/twitter
// are usernames, linkedin/website are URLs; the web layer builds the hrefs.

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
  upcomingEvents: z.array(eventSummarySchema),
  pastEvents: z.array(eventSummarySchema),
});
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>;
