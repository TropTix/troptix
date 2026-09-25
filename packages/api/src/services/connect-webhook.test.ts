import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import { handleConnectEvent } from './connect-webhook';

const NOW = new Date('2026-09-22T12:00:00Z');
const CAPABILITY_EVENT =
  'v2.core.account[configuration.recipient].capability_status_updated';

function notification(type: string, status?: string, id = 'acct_1') {
  const fetchRelatedObject = vi.fn(async () => ({
    id,
    configuration: status
      ? {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { status, status_details: [] },
              },
            },
          },
        }
      : undefined,
  }));
  return {
    notification: {
      id: 'evt_1',
      type,
      fetchRelatedObject,
    } as unknown as Stripe.V2.Core.EventNotification,
    fetchRelatedObject,
  };
}

function fakePrisma(orgId: string | null = 'org-1') {
  const findUnique = vi.fn().mockResolvedValue(orgId ? { id: orgId } : null);
  const update = vi.fn().mockResolvedValue({ id: orgId });
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    organization: { findUnique, update, updateMany },
  } as unknown as PrismaClient;
  return { prisma, findUnique, update, updateMany };
}

describe('handleConnectEvent', () => {
  it('ignores event types it is not subscribed to without fetching', async () => {
    const { prisma, update, updateMany } = fakePrisma();
    const { notification: n, fetchRelatedObject } = notification(
      'v2.core.account.updated',
      'active'
    );
    await expect(handleConnectEvent(prisma, n, NOW)).resolves.toBe('ignored');
    expect(fetchRelatedObject).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', 'pending'],
    ['restricted', 'restricted'],
    [undefined, null],
  ] as const)(
    'records transfers %s without stamping the gate',
    async (status, stored) => {
      const { prisma, update, updateMany } = fakePrisma();
      const { notification: n } = notification(CAPABILITY_EVENT, status);
      await expect(handleConnectEvent(prisma, n, NOW)).resolves.toBe('synced');
      expect(update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { stripeTransfersStatus: stored },
      });
      expect(updateMany).not.toHaveBeenCalled();
    }
  );

  it('acknowledges an account no organization holds', async () => {
    const { prisma, findUnique, update, updateMany } = fakePrisma(null);
    const { notification: n } = notification(CAPABILITY_EVENT, 'active');
    await expect(handleConnectEvent(prisma, n, NOW)).resolves.toBe(
      'unknown_account'
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { stripeAccountId: 'acct_1' },
      select: { id: true },
    });
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([CAPABILITY_EVENT, 'v2.core.account[requirements].updated'])(
    'records active and stamps the gate once when %s reports it',
    async (type) => {
      const { prisma, update, updateMany } = fakePrisma('org-9');
      const { notification: n } = notification(type, 'active');
      await expect(handleConnectEvent(prisma, n, NOW)).resolves.toBe('synced');
      expect(update).toHaveBeenCalledWith({
        where: { id: 'org-9' },
        data: { stripeTransfersStatus: 'active' },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'org-9', payoutBankLinkedAt: null },
        data: { payoutBankLinkedAt: NOW },
      });
    }
  );
});
