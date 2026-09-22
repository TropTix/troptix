import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import { stampBankLinked, transfersStatus } from './organizer-connect';

export type ConnectEventOutcome =
  | 'stamped'
  | 'not_active'
  | 'unknown_account'
  | 'ignored';

/**
 * Thin events carry only ids, so the account is fetched fresh; the only fact
 * this handler records is "transfers went active", and only once.
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
  if (transfersStatus(account) !== 'active') return 'not_active';

  const org = await prisma.organization.findUnique({
    where: { stripeAccountId: account.id },
    select: { id: true },
  });
  if (!org) return 'unknown_account';

  await stampBankLinked(prisma, org.id, now);
  return 'stamped';
}
