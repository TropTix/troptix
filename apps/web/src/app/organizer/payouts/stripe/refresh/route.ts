import { NextResponse, type NextRequest } from 'next/server';
import { refreshStripeOnboarding } from '@troptix/api/server';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import { getRequestOrigin } from '@/server/lib/requestOrigin';

/** An expired or reused Account Link lands here and gets a fresh one. */
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { origin } = req.nextUrl;
  const user = await getServerUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/auth/signin`);
  }

  try {
    const { url } = await refreshStripeOnboarding(
      prisma,
      stripe,
      userToActor(user),
      { baseUrl: await getRequestOrigin() }
    );
    if (url) return NextResponse.redirect(url);
  } catch (err) {
    console.error('[ConnectRefresh] Could not mint a new link:', err);
  }

  return NextResponse.redirect(`${origin}/organizer/payouts`);
}
