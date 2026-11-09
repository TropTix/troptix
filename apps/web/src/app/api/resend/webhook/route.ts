import { NextResponse, after } from 'next/server';
import { recordDeliveryEvent, UNDELIVERED_STATUSES } from '@troptix/api/server';
import prisma from '@/server/prisma';
import { resend } from '@/server/lib/email';
import { captureEmailFailed } from '@/server/lib/analytics';

/**
 * Resend's delivery events for the `Email` table (ADR 0039). Sign-in codes go
 * through the same Resend account and arrive here too; they match no row.
 */
export const runtime = 'nodejs';

const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

export async function POST(req: Request) {
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }
  const payload = await req.text();
  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get('svix-id') ?? '',
        timestamp: req.headers.get('svix-timestamp') ?? '',
        signature: req.headers.get('svix-signature') ?? '',
      },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (!event.type.startsWith('email.') || !('email_id' in event.data)) {
    return NextResponse.json({ received: true });
  }

  const changed = await recordDeliveryEvent(prisma, {
    type: event.type,
    resendId: event.data.email_id,
    emailId: event.data.tags?.email_id,
    at: new Date(event.created_at),
  });
  if (changed && UNDELIVERED_STATUSES.includes(changed.status)) {
    after(() =>
      captureEmailFailed({
        emailId: changed.id,
        type: changed.type,
        status: changed.status,
      })
    );
  }
  return NextResponse.json({ received: true });
}
