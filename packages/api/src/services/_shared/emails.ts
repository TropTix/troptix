import type { Prisma } from '@troptix/db';

export const EMAIL_TYPES = {
  orderConfirmation: 'order_confirmation',
  refundNotice: 'refund_notice',
  disputeNotice: 'dispute_notice',
} as const;

export type EmailType = (typeof EMAIL_TYPES)[keyof typeof EMAIL_TYPES];

export interface EmailToEnqueue {
  type: EmailType;
  subjectId: string;
  to: string;
  idempotencyKey: string;
  priority?: number;
}

/**
 * Call inside the transaction that creates what the email is about, so both
 * commit or neither does. A second enqueue with the same key writes nothing.
 */
export async function enqueueEmail(
  db: Prisma.TransactionClient,
  email: EmailToEnqueue
): Promise<void> {
  await db.email.createMany({ data: [email], skipDuplicates: true });
}

export function orderConfirmationKey(orderId: string): string {
  return `confirmation-${orderId}`;
}

export function refundNoticeKey(reservationId: string): string {
  return `refund-${reservationId}`;
}
