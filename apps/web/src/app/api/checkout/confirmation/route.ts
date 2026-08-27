import { NextResponse } from 'next/server';
import { sendEmailConfirmationEmailToUser } from '@/server/lib/email';

// Idempotent: Resend dedupes on `confirmation-${orderId}`, so repeated calls
// (client success screen + webhook) never double-send.
export async function POST(req: Request) {
  try {
    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId is required' },
        { status: 400 }
      );
    }

    await sendEmailConfirmationEmailToUser(orderId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Failed to send confirmation', details },
      { status: 500 }
    );
  }
}
