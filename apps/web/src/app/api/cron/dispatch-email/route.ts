import { NextResponse } from 'next/server';
import { dispatchDueEmails } from '@/server/lib/email';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Fails closed when CRON_SECRET is unset (issue #358).
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dispatchDueEmails();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DispatchEmail] Dispatch failed:', error);
    return NextResponse.json(
      { success: false, error: 'Dispatch failed' },
      { status: 500 }
    );
  }
}
