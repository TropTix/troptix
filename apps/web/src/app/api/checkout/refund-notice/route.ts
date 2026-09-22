import { NextResponse } from 'next/server';
import { sendRefundNoticeEmail } from '@/server/lib/email';

/**
 * The webhook sends this server-side; the client fires it too when its poll is
 * what performed the refund (ADR 0018). Resend dedupes on `refund-${reservationId}`.
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
