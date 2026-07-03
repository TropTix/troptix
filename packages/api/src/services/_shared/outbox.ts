/**
 * Transactional outbox — the enqueue half (ADR 0018; the reservation-rebuild
 * plan's "insert an outbox row … sent after commit / by cron drain, never inside
 * the txn"). Rows are written atomically with the order/refund they notify about;
 * delivery happens out of band in `apps/web` (the drainer lives next to the email
 * lib), fired by the cron backstop plus an inline `after()` nudge on the webhook.
 *
 * `type` is the persisted discriminator on `OutboxMessage.type`; the payload shape
 * is the contract the drainer dispatches on. Keep the two in lockstep.
 */
import type { Prisma } from '@troptix/db';

export const OUTBOX_ORDER_CONFIRMATION = 'order_confirmation';
export const OUTBOX_REFUND_NOTICE = 'refund_notice';

export interface OrderConfirmationPayload {
  orderId: string;
}
export interface RefundNoticePayload {
  reservationId: string;
}

/** Ties each message type to its payload shape, so callers can't mismatch them. */
interface OutboxPayloadMap {
  order_confirmation: OrderConfirmationPayload;
  refund_notice: RefundNoticePayload;
}

/** Insert a PENDING outbox row inside an existing transaction. */
export function enqueueOutbox<T extends keyof OutboxPayloadMap>(
  tx: Prisma.TransactionClient,
  type: T,
  payload: OutboxPayloadMap[T]
): Promise<unknown> {
  return tx.outboxMessage.create({
    // Interfaces lack an index signature, so cast through `unknown` to satisfy
    // Prisma's structural JSON type.
    data: { type, payload: payload as unknown as Prisma.InputJsonValue },
  });
}
