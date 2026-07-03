/**
 * Transactional outbox — the enqueue half (ADR 0018). Rows are written
 * atomically with the order/refund they notify about; the drainer in `apps/web`
 * delivers them out of band. `type` is the persisted discriminator the drainer
 * dispatches on; keep it in lockstep with the payload map below.
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
