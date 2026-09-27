import { NextResponse } from 'next/server';
import { reconcileStripePayouts } from '@troptix/api/server';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';

/**
 * Daily check that Stripe's transfers and the payout rows agree (ADR 0030
 * decision 17). Reports, never repairs: a mismatch is a human's call.
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const mismatches = await reconcileStripePayouts(prisma, stripe);
    if (mismatches.length > 0) {
      console.error('[ReconcilePayouts] Mismatches found:', mismatches);
    }
    return NextResponse.json({ success: true, mismatches });
  } catch (error) {
    console.error('[ReconcilePayouts] Reconciliation failed:', error);
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Reconciliation failed', details },
      { status: 500 }
    );
  }
}
