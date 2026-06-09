import ShortUniqueId from 'short-unique-id';

/**
 * Canonical row-id generator (alphanum upper, 12 chars) — the format used for
 * every primary key in the schema. Mirrors `apps/web`'s `generateId`; the two
 * should be consolidated when the app moves onto the service layer.
 */
export function generateId(): string {
  const uid = new ShortUniqueId({ dictionary: 'alphanum_upper', length: 12 });
  return uid.rnd();
}
