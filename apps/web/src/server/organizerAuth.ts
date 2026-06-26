import { getUserFromIdTokenCookie } from '@/server/authUser';
import type { ServerUser } from '@/server/authUser';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Why the organizer guard failed:
 * - `missing-token`: no usable Bearer token was present in the
 *   `Authorization` header.
 * - `invalid-token`: a token was present but didn't resolve to a known user.
 *
 * Routes map these to their own 401/403 bodies, so the wording stays
 * route-specific while the resolution logic is shared.
 */
export type OrganizerAuthFailure = 'missing-token' | 'invalid-token';

/**
 * The outcome of guarding an organizer API route: either the resolved user
 * (`ok: true`), or a typed failure (`ok: false`) the caller turns into the
 * right 401/403 response. `ok` is the discriminant, so a route can narrow to
 * the resolved user by checking `auth.ok`.
 */
export type OrganizerAuthResult =
  | { ok: true; user: ServerUser }
  | { ok: false; failure: OrganizerAuthFailure };

/**
 * Resolve the organizer behind an API request from its `Authorization` header.
 *
 * Reads the request headers, takes the Bearer token, and resolves it to a
 * `ServerUser` via {@link getUserFromIdTokenCookie}. Returns `{ user }` on
 * success, or `{ failure }` describing why auth failed so the caller can return
 * the appropriate 401 (`missing-token`) or 403 (`invalid-token`) response with
 * its own wording.
 *
 * A header is only accepted when it is a non-empty `Bearer <token>` — matching
 * the events/orders routes' original `startsWith('Bearer ')` guard.
 */
export async function extractOrganizer(): Promise<OrganizerAuthResult> {
  const headersList = await headers();
  const authorization = headersList.get('authorization');
  const token =
    authorization && authorization.startsWith('Bearer ')
      ? authorization.split(' ')[1]
      : undefined;

  if (!token) {
    return { ok: false, failure: 'missing-token' };
  }

  const user = await getUserFromIdTokenCookie(token);
  if (!user) {
    return { ok: false, failure: 'invalid-token' };
  }

  return { ok: true, user };
}
