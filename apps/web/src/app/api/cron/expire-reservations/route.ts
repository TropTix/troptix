import { NextResponse } from 'next/server';
import { sweepExpiredHolds } from '@troptix/api/server';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';
import { drainOutbox } from '@/server/lib/outbox';

/**
 * Expire reservation holds past their TTL (ADR 0018). Cancel-then-release: the
 * sweep expires each hold's Checkout Session before handing inventory back, so a
 * payment can never land after release. Also drains the email outbox — the
 * backstop for the free path and any webhook-missed paid ones. Scheduled via
 * Supabase cron (pg_cron + pg_net) — see docs/runbooks/expire-reservations-cron.md.
 *
 * Auth: requires `Authorization: Bearer $CRON_SECRET` (the cron job sends this
 * header). Fails closed if CRON_SECRET is unset — a money-adjacent endpoint must
 * not be open (issue #358).
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sweepExpiredHolds(prisma, stripe);
    const drain = await drainOutbox();
    return NextResponse.json({ success: true, ...result, drain });
  } catch (error) {
    console.error('[ExpireReservations] Sweep failed:', error);
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Sweep failed', details },
      { status: 500 }
    );
  }
}
