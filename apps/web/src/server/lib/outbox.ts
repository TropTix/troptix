import prisma from '@/server/prisma';
import { OutboxStatus } from '@troptix/db';
import {
  OUTBOX_ORDER_CONFIRMATION,
  OUTBOX_REFUND_NOTICE,
  type OrderConfirmationPayload,
  type RefundNoticePayload,
} from '@troptix/api/server';
import {
  sendEmailConfirmationEmailToUser,
  sendRefundNoticeEmail,
} from './email';

/**
 * Transactional outbox drainer — the delivery half (ADR 0018). Lives here, not
 * in `@troptix/api`, because the email transport lib does (graduating it is the
 * email-worker work, #334). Fired once a minute by the expire-reservations cron
 * — the sole drainer, so both free and paid deliver within one tick. Sends are
 * idempotent (Resend dedupes on confirmation-<orderId> / refund-<reservationId>)
 * for the belt-and-suspenders case of an at-least-once cron. Near-instant inline
 * drain is #425.
 */
const MAX_ATTEMPTS = 5;
const DEFAULT_LIMIT = 20;

export type OutboxSenders = Record<string, (payload: unknown) => Promise<void>>;

const defaultSenders: OutboxSenders = {
  [OUTBOX_ORDER_CONFIRMATION]: async (payload) => {
    await sendEmailConfirmationEmailToUser(
      (payload as OrderConfirmationPayload).orderId
    );
  },
  [OUTBOX_REFUND_NOTICE]: async (payload) => {
    await sendRefundNoticeEmail((payload as RefundNoticePayload).reservationId);
  },
};

export interface DrainResult {
  sent: number;
  failed: number;
}

/** `senders` is injectable for tests. */
export async function drainOutbox(
  limit = DEFAULT_LIMIT,
  senders: OutboxSenders = defaultSenders
): Promise<DrainResult> {
  const pending = await prisma.outboxMessage.findMany({
    where: { status: OutboxStatus.PENDING, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const msg of pending) {
    const send = senders[msg.type];
    try {
      if (!send) throw new Error(`Unknown outbox message type: ${msg.type}`);
      await send(msg.payload);
      await prisma.outboxMessage.update({
        where: { id: msg.id },
        data: {
          status: OutboxStatus.SENT,
          processedAt: new Date(),
          lastError: null,
        },
      });
      sent++;
    } catch (err) {
      const attempts = msg.attempts + 1;
      await prisma.outboxMessage.update({
        where: { id: msg.id },
        data: {
          attempts,
          lastError: err instanceof Error ? err.message : 'Unknown error',
          status:
            attempts >= MAX_ATTEMPTS
              ? OutboxStatus.FAILED
              : OutboxStatus.PENDING,
        },
      });
      failed++;
    }
  }

  return { sent, failed };
}
