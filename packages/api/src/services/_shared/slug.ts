/**
 * Organization slug helpers (vanity URL `/o/[slug]`).
 *
 * Pure — no DB. Uniqueness is delegated to an injected `isTaken` predicate so
 * `generateUniqueSlug` stays unit-testable; the org service supplies the real
 * lookup. See docs/plans/2026-06-event-spotlight-and-organizer-brand.md (3b).
 */

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

const trimHyphens = (s: string): string => s.replace(/^-+|-+$/g, '');

/**
 * Normalize arbitrary text to slug form: lowercase, diacritics stripped, every
 * run of non-`[a-z0-9]` collapsed to a single hyphen, no leading/trailing hyphen.
 * May return `''` (e.g. punctuation-only input) or a string outside the length
 * bounds — callers validate/lengthen as needed.
 */
export function slugify(input: string): string {
  return trimHyphens(
    input
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
  );
}

/** A user-entered slug is valid: format, length 3–32, and not reserved. */
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

/**
 * Derive a unique, valid slug from `input`. Slugifies, lengthens too-short
 * roots, truncates to the max, then appends `-2`, `-3`, … until `isTaken`
 * reports the candidate free. The suffix never pushes past `SLUG_MAX_LENGTH`.
 */
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
