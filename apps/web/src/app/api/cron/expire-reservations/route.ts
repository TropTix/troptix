import { NextResponse } from 'next/server';
import { sweepExpiredHolds } from '@troptix/api/server';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';

/**
 * Cancel-then-release (ADR 0018): the sweep expires each hold's Checkout
 * Session before handing inventory back, so a payment can never land after release.
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Fails closed when CRON_SECRET is unset (issue #358).
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sweepExpiredHolds(prisma, stripe);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[ExpireReservations] Sweep failed:', error);
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Sweep failed', details },
      { status: 500 }
    );
  }
}
