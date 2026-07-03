import { randomBytes } from 'node:crypto';
import ShortUniqueId from 'short-unique-id';

// One reentrant generator for the process — `generateId` is called many times
// per reserve/confirm (one per item / reservation / order / ticket row), so
// constructing it per call would be wasteful.
const uid = new ShortUniqueId({ dictionary: 'alphanum_upper', length: 12 });

/**
 * Canonical row-id generator (alphanum upper, 12 chars) — the format used for
 * every primary key in the schema. Mirrors `apps/web`'s `generateId`; the two
 * should be consolidated when the app moves onto the service layer.
 */
export function generateId(): string {
  return uid.rnd();
}

/**
 * High-entropy, URL-safe token for guest ticket access (the order's `accessToken`).
 * 32 random bytes → base64url; unguessable, and deliberately separate from the row
 * id so the PK never doubles as a bearer secret.
 */
export function generateAccessToken(): string {
  return randomBytes(32).toString('base64url');
}
