import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmailConfirmationEmailToUser } from '@/server/lib/email';

const bodySchema = z.object({ orderId: z.string().min(1) });

/**
 * Sends the order confirmation email after checkout. Fired (fire-and-forget) by
 * the checkout flow once an order materializes. Idempotent: Resend dedupes on
 * `confirmation-${orderId}`, so repeated calls never double-send.
 */
export async function POST(req: Request) {
  try {
    const body = bodySchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { success: false, error: 'orderId is required' },
        { status: 400 }
      );
    }

    await sendEmailConfirmationEmailToUser(body.data.orderId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Failed to send confirmation', details },
      { status: 500 }
    );
  }
}
