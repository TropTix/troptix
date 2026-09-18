import type { Role } from '@troptix/db';
import prisma from '@/server/prisma';
import { createClient } from '@/lib/supabase/server';

/**
 * `uid` is the app PK (`Users.id`) — what queries take as `organizerUserId` —
 * NOT the Supabase auth id (`sub`/`authUserId`). ADR 0011/0015.
 */
export interface ServerUser {
  uid: string;
  email?: string;
  role?: Role;
  isPlatformOwner: boolean;
}

/**
 * `createClient()` reads cookies() *outside* the try, so a Server Component's
 * DynamicServerError propagates (opting the route into dynamic rendering)
 * instead of being swallowed as an auth failure.
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

async function resolveByAuthUserId(
  authUserId: string
): Promise<ServerUser | null> {
  const appUser = await prisma.users.findUnique({
    where: { authUserId },
    select: { id: true, email: true, role: true, isPlatformOwner: true },
  });
  if (!appUser) {
    // Authenticated with Supabase but no linked Users row (e.g. an email the
    // provisioning trigger couldn't match). Treat as unauthenticated.
    return null;
  }
  return {
    uid: appUser.id,
    email: appUser.email,
    role: appUser.role,
    isPlatformOwner: appUser.isPlatformOwner ?? false,
  };
}

export async function getServerUser(): Promise<ServerUser | null> {
  const sub = await getAuthUserId();
  return sub ? resolveByAuthUserId(sub) : null;
}

export async function getUserFromIdTokenCookie(
  token?: string
): Promise<ServerUser | null> {
  const sub = await getAuthUserId(token);
  return sub ? resolveByAuthUserId(sub) : null;
}

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
      isPlatformOwner: true,
    },
  });
}
