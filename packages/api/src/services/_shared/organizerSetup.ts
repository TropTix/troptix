/**
 * What an Organization still has to do before it looks like a brand.
 *
 * One rule with two consumers: the home screen's setup banner ("Finish your
 * organizer profile →") and the profile screen that the banner links to, which
 * needs to know *which* fields are missing to render its setup area. Returning
 * the fields — rather than a boolean — keeps those two from disagreeing the
 * moment the requirements change.
 */
export type ProfileField = 'logo' | 'bio';

type BrandFields = Pick<
  { logoUrl: string | null; bio: string | null },
  'logoUrl' | 'bio'
>;

export function missingProfileFields(
  org: BrandFields | null | undefined
): ProfileField[] {
  if (!org) return ['logo', 'bio'];

  const missing: ProfileField[] = [];
  if (!org.logoUrl) missing.push('logo');
  if (!org.bio) missing.push('bio');
  return missing;
}

export function isProfileComplete(
  org: BrandFields | null | undefined
): boolean {
  return missingProfileFields(org).length === 0;
}
