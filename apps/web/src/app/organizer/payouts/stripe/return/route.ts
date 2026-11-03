import { NextResponse, type NextRequest } from 'next/server';
import type { ConnectReturnOutcome } from '@troptix/api';
import { finishStripeOnboardingReturn } from '@troptix/api/server';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';

/**
 * Stripe's return_url is a plain GET with no state; the outcome is a live
 * read, and the payouts page turns the query param into one banner.
 */
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { origin } = req.nextUrl;
  const user = await getServerUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/auth/signin`);
  }

  let outcome: ConnectReturnOutcome = 'incomplete';
  try {
    outcome = await finishStripeOnboardingReturn(
      prisma,
      stripe,
      userToActor(user)
    );
  } catch (err) {
    console.error('[ConnectReturn] Could not read the account:', err);
  }

  return NextResponse.redirect(`${origin}/organizer/payouts?stripe=${outcome}`);
}
