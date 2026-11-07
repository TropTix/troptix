export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 32;

/** Reserved so a slug can't shadow a current/future `/o/*` sub-route. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'new',
  'edit',
  'settings',
  'admin',
  'api',
  'o',
  'organizer',
  'organization',
  'organizations',
  'event',
  'events',
  'discover',
  'auth',
  'login',
  'signin',
  'signup',
  'order',
  'orders',
  'profile',
  'me',
  'about',
  'help',
  'terms',
  'privacy',
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EDGE_HYPHENS = /^-+|-+$/g;
// Combining diacritical marks (U+0300–U+036F); a plain BMP range so this
// needs no `u` flag / property escape (apps/web compiles at target es5).
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_RUN = /[^a-z0-9]+/g;

const trimHyphens = (s: string): string => s.replace(EDGE_HYPHENS, '');

export function slugify(input: string): string {
  return trimHyphens(
    input
      .normalize('NFKD')
      .replace(COMBINING_MARKS, '')
      .toLowerCase()
      .replace(NON_ALPHANUMERIC_RUN, '-')
  );
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN_LENGTH &&
    slug.length <= SLUG_MAX_LENGTH &&
    SLUG_PATTERN.test(slug) &&
    !RESERVED_SLUGS.has(slug)
  );
}

const isFree = (slug: string, isTaken: (s: string) => boolean): boolean =>
  !RESERVED_SLUGS.has(slug) && !isTaken(slug);

export function generateUniqueSlug(
  input: string,
  isTaken: (slug: string) => boolean
): string {
  let root = slugify(input);
  if (root.length < SLUG_MIN_LENGTH) {
    root = slugify(`${root}-org`) || 'org';
  }
  root = trimHyphens(root.slice(0, SLUG_MAX_LENGTH));

  if (isFree(root, isTaken)) return root;

  for (let n = 2; n < 10_000; n++) {
    const suffix = `-${n}`;
    const candidate =
      trimHyphens(root.slice(0, SLUG_MAX_LENGTH - suffix.length)) + suffix;
    if (isFree(candidate, isTaken)) return candidate;
  }
  throw new Error('Could not generate a unique slug');
}
