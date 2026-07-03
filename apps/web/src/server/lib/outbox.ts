import prisma from '@/server/prisma';
import { OutboxStatus, type Prisma } from '@troptix/db';
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
 * email-worker work, #334).
 *
 * Two triggers, both idempotent (Resend dedupes on confirmation-<orderId> /
 * refund-<reservationId>):
 * - `drainOrderConfirmation` / `drainRefundNotice` send a SINGLE known row inline
 *   (fired via `after()` right after fulfillment) for near-instant delivery.
 * - `drainOutbox` sweeps a batch from the once-a-minute cron — the backstop for
 *   the free path, a webhook-missed paid one, or an inline send that failed.
 * Single-row inline + batch cron never fight over rows the way a whole-table
 * inline drain would (#425).
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

type OutboxRow = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
};

/** Send one row and record the outcome. Returns whether it sent. */
async function processMessage(
  msg: OutboxRow,
  senders: OutboxSenders
): Promise<boolean> {
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
    return true;
  } catch (err) {
    const attempts = msg.attempts + 1;
    await prisma.outboxMessage.update({
      where: { id: msg.id },
      data: {
        attempts,
        lastError: err instanceof Error ? err.message : 'Unknown error',
        status:
          attempts >= MAX_ATTEMPTS ? OutboxStatus.FAILED : OutboxStatus.PENDING,
      },
    });
    return false;
  }
}

export interface DrainResult {
  sent: number;
  failed: number;
}

/** Batch drain from the cron backstop. `senders` is injectable for tests. */
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
    if (await processMessage(msg, senders)) sent++;
    else failed++;
  }
  return { sent, failed };
}

/** Send one still-pending row matching `where`, if present. */
async function drainOne(
  where: Prisma.OutboxMessageWhereInput,
  senders: OutboxSenders = defaultSenders
): Promise<void> {
  const msg = await prisma.outboxMessage.findFirst({
    where: {
      status: OutboxStatus.PENDING,
      attempts: { lt: MAX_ATTEMPTS },
      ...where,
    },
  });
  if (msg) await processMessage(msg, senders);
}

/** Inline-deliver the confirmation for a just-materialized order. */
export function drainOrderConfirmation(
  orderId: string,
  senders?: OutboxSenders
): Promise<void> {
  return drainOne(
    {
      type: OUTBOX_ORDER_CONFIRMATION,
      payload: { path: ['orderId'], equals: orderId },
    },
    senders
  );
}

/** Inline-deliver the refund notice for a just-refunded reservation. */
export function drainRefundNotice(
  reservationId: string,
  senders?: OutboxSenders
): Promise<void> {
  return drainOne(
    {
      type: OUTBOX_REFUND_NOTICE,
      payload: { path: ['reservationId'], equals: reservationId },
    },
    senders
  );
}
