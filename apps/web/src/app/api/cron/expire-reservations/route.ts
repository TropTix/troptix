import { NextResponse } from 'next/server';
import { sweepExpiredHolds } from '@troptix/api/server';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';

/**
 * Expire reservation holds past their TTL (ADR 0018). Cancel-then-release: the
 * sweep expires each hold's Checkout Session before handing inventory back, so a
 * payment can never land after release. Schedule via Vercel Cron.
 *
 * Auth: requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this).
 * Fails closed if CRON_SECRET is unset — a money-adjacent endpoint must not be
 * open (issue #358).
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
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
