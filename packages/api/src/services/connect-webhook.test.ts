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
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    organization: { findUnique, updateMany },
  } as unknown as PrismaClient;
  return { prisma, findUnique, updateMany };
}

describe('handleConnectEvent', () => {
  it('ignores event types it is not subscribed to without fetching', async () => {
    const { prisma, updateMany } = fakePrisma();
    const { notification: n, fetchRelatedObject } = notification(
      'v2.core.account.updated',
      'active'
    );
    await expect(handleConnectEvent(prisma, n, NOW)).resolves.toBe('ignored');
    expect(fetchRelatedObject).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each(['pending', 'restricted', undefined])(
    'does nothing while transfers are %s',
    async (status) => {
      const { prisma, updateMany } = fakePrisma();
      const { notification: n } = notification(CAPABILITY_EVENT, status);
      await expect(handleConnectEvent(prisma, n, NOW)).resolves.toBe(
        'not_active'
      );
      expect(updateMany).not.toHaveBeenCalled();
    }
  );

  it('acknowledges an account no organization holds', async () => {
    const { prisma, findUnique, updateMany } = fakePrisma(null);
    const { notification: n } = notification(CAPABILITY_EVENT, 'active');
    await expect(handleConnectEvent(prisma, n, NOW)).resolves.toBe(
      'unknown_account'
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { stripeAccountId: 'acct_1' },
      select: { id: true },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([CAPABILITY_EVENT, 'v2.core.account[requirements].updated'])(
    'stamps the gate once when %s reports transfers active',
    async (type) => {
      const { prisma, updateMany } = fakePrisma('org-9');
      const { notification: n } = notification(type, 'active');
      await expect(handleConnectEvent(prisma, n, NOW)).resolves.toBe('stamped');
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'org-9', payoutBankLinkedAt: null },
        data: { payoutBankLinkedAt: NOW },
      });
    }
  );
});
