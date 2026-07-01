import { NextResponse } from 'next/server';
import { sendRefundNoticeEmail } from '@/server/lib/email';

/**
 * Sends the auto-refund notice after the expiry race (ADR 0018). The reservation
 * webhook sends it server-side, but when the client's sync-fulfillment poll is
 * what performed the refund (webhook slow/down), the client fires this too.
 * Idempotent: Resend dedupes on `refund-${reservationId}`, so repeated calls
 * never double-send.
 */
export async function POST(req: Request) {
  try {
    const { reservationId } = (await req.json()) as { reservationId?: string };
    if (!reservationId) {
      return NextResponse.json(
        { success: false, error: 'reservationId is required' },
        { status: 400 }
      );
    }

    await sendRefundNoticeEmail(reservationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Failed to send refund notice', details },
      { status: 500 }
    );
  }
}
