import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import { recordTransfersStatus, transfersStatus } from './organizer-connect';

export type ConnectEventOutcome = 'synced' | 'unknown_account' | 'ignored';

/**
 * Thin events carry only ids, so the account is fetched fresh. Every
 * subscribed event mirrors the transfers status into the row, in both
 * directions; the gate stamps once when it reads active.
 */
export async function handleConnectEvent(
  prisma: PrismaClient,
  notification: Stripe.V2.Core.EventNotification,
  now: Date = new Date()
): Promise<ConnectEventOutcome> {
  if (
    notification.type !==
      'v2.core.account[configuration.recipient].capability_status_updated' &&
    notification.type !== 'v2.core.account[requirements].updated'
  ) {
    return 'ignored';
  }

  const account = await notification.fetchRelatedObject();
  const org = await prisma.organization.findUnique({
    where: { stripeAccountId: account.id },
    select: { id: true },
  });
  if (!org) return 'unknown_account';

  await recordTransfersStatus(prisma, org.id, transfersStatus(account), now);
  return 'synced';
}
