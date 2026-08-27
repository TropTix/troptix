import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/server/authUser';

export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: { ...profile, isOrganizer: profile.role === 'ORGANIZER' },
  });
}
