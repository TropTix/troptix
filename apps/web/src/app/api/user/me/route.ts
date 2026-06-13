import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/server/authUser';

/**
 * The current app user, resolved from the Supabase session in a single query
 * (auth `sub` → `Users` by `authUserId`). AuthProvider calls this after sign-in
 * to hydrate the client with the stable id + profile + role, since the Supabase
 * session only carries the `authUserId`.
 */
export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: { ...profile, isOrganizer: profile.role === 'ORGANIZER' },
  });
}
