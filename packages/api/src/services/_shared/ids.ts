import ShortUniqueId from 'short-unique-id';

const uid = new ShortUniqueId({ dictionary: 'alphanum_upper', length: 12 });

// Mirrors `apps/web`'s `generateId` — keep the two in sync until they are
// consolidated.
export function generateId(): string {
  return uid.rnd();
}
