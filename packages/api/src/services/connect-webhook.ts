import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import {
  recordTransfersStatus,
  retrieveAccount,
  transfersStatus,
  type PayoutClients,
} from './organizer-connect';

export type ConnectEventOutcome = 'synced' | 'unknown_account' | 'ignored';

/**
 * Thin events carry only ids, so the account is fetched fresh, through the
 * client its kind needs (a recipient's capability is invisible to the GA
 * version). Every subscribed event mirrors the payout capability's status
 * into the row, in both directions; the gate stamps once when it reads
 * active.
 */
export async function handleConnectEvent(
  prisma: PrismaClient,
  clients: PayoutClients,
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

  const related = notification.related_object;
  if (!related || related.type !== 'v2.core.account') return 'ignored';
  const accountId = related.id;
  const org = await prisma.organization.findUnique({
    where: { stripeAccountId: accountId },
    select: { id: true, stripeAccountKind: true },
  });
  if (!org) return 'unknown_account';

  const account = await retrieveAccount(clients, {
    stripeAccountId: accountId,
    stripeAccountKind: org.stripeAccountKind,
  });
  await recordTransfersStatus(prisma, org.id, transfersStatus(account), now);
  return 'synced';
}
