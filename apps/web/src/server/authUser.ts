import type { Role } from '@troptix/db';
import prisma from '@/server/prisma';
import { createClient } from '@/lib/supabase/server';

/**
 * The resolved server-side user. `uid` is the stable app PK (`Users.id`) — it is
 * what callers pass as `organizerUserId` in queries, NOT the Supabase auth id
 * (`sub`/`authUserId`). See ADR 0011/0015.
 */
export interface ServerUser {
  uid: string;
  email?: string;
  role?: Role;
}

/**
 * Verify the request's Supabase identity and return its auth id (the `sub`
 * claim). Pass a token for the Bearer path (mobile API routes); omit it to read
 * the session cookie. Returns null when unauthenticated, or when Supabase env is
 * unset (e.g. at build).
 *
 * `createClient()` reads cookies() *outside* the try, so a Server Component's
 * DynamicServerError propagates (opting the route into dynamic rendering)
 * instead of being swallowed as a failure.
 */
async function getAuthUserId(token?: string): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }
  const supabase = await createClient();
  try {
    const { data } = await supabase.auth.getClaims(token);
    return data?.claims?.sub ?? null;
  } catch (error) {
    console.error('Supabase getClaims failed:', error);
    return null;
  }
}

/** Resolve a verified Supabase auth id (`sub`) → the app `Users` row. */
async function resolveByAuthUserId(
  authUserId: string
): Promise<ServerUser | null> {
  const appUser = await prisma.users.findUnique({
    where: { authUserId },
    select: { id: true, email: true, role: true },
  });
  if (!appUser) {
    // Authenticated with Supabase but no linked Users row (e.g. an email the
    // provisioning trigger couldn't match). Treat as unauthenticated.
    return null;
  }
  return { uid: appUser.id, email: appUser.email, role: appUser.role };
}

/** The current user from the session cookie → stable `Users` row. */
export async function getServerUser(): Promise<ServerUser | null> {
  const sub = await getAuthUserId();
  return sub ? resolveByAuthUserId(sub) : null;
}

/**
 * Resolve a user from an explicit Supabase access token (the Bearer path the
 * organizer/mobile API routes use). Falls back to the session cookie when no
 * token is passed.
 */
export async function getUserFromIdTokenCookie(
  token?: string
): Promise<ServerUser | null> {
  const sub = await getAuthUserId(token);
  return sub ? resolveByAuthUserId(sub) : null;
}

/**
 * The current user's full profile in a single query — used by /api/user/me to
 * hydrate the client. Skips getServerUser's resolve + a second lookup.
 */
export async function getCurrentUserProfile() {
  const sub = await getAuthUserId();
  if (!sub) {
    return null;
  }
  return prisma.users.findUnique({
    where: { authUserId: sub },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      stripeId: true,
    },
  });
}
