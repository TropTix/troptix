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
