import ShortUniqueId from 'short-unique-id';

const uid = new ShortUniqueId({ dictionary: 'alphanum_upper', length: 12 });

export function generateId(): string {
  return uid.rnd();
}
