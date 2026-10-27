import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import { handleConnectEvent } from './connect-webhook';
import type { PayoutClients } from './organizer-connect';

const NOW = new Date('2026-09-22T12:00:00Z');
const CAPABILITY_EVENT =
  'v2.core.account[configuration.recipient].capability_status_updated';

function notification(type: string, id: string | null = 'acct_1') {
  return {
    id: 'evt_1',
    type,
    related_object: id ? { id, type: 'v2.core.account', url: '' } : null,
  } as unknown as Stripe.V2.Core.EventNotification;
}

function fakeClients(opts: {
  status?: string;
  capability?: 'stripe_transfers' | 'bank_accounts';
}) {
  const account = (id: string) => ({
    id,
    configuration: opts.status
      ? {
          recipient: {
            capabilities:
              opts.capability === 'bank_accounts'
                ? { bank_accounts: { local: { status: opts.status } } }
                : {
                    stripe_balance: {
                      stripe_transfers: { status: opts.status },
                    },
                  },
          },
        }
      : undefined,
  });
  const connectRetrieve = vi.fn(async (id: string) => account(id));
  const globalRetrieve = vi.fn(async (id: string) => account(id));
  const clients = {
    connect: { v2: { core: { accounts: { retrieve: connectRetrieve } } } },
    global: { v2: { core: { accounts: { retrieve: globalRetrieve } } } },
  } as unknown as PayoutClients;
  return { clients, connectRetrieve, globalRetrieve };
}

function fakePrisma(
  org: { id: string; stripeAccountKind?: string | null } | null = {
    id: 'org-1',
  }
) {
  const findUnique = vi
    .fn()
    .mockResolvedValue(
      org
        ? { id: org.id, stripeAccountKind: org.stripeAccountKind ?? null }
        : null
    );
  const update = vi.fn().mockResolvedValue({ id: org?.id });
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    organization: { findUnique, update, updateMany },
  } as unknown as PrismaClient;
  return { prisma, findUnique, update, updateMany };
}

describe('handleConnectEvent', () => {
  it('ignores event types it is not subscribed to without fetching', async () => {
    const { prisma, update, updateMany } = fakePrisma();
    const { clients, connectRetrieve } = fakeClients({ status: 'active' });
    await expect(
      handleConnectEvent(
        prisma,
        clients,
        notification('v2.core.account.updated'),
        NOW
      )
    ).resolves.toBe('ignored');
    expect(connectRetrieve).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('ignores a subscribed event with no related object, or one that is not an account', async () => {
    const { prisma, findUnique } = fakePrisma();
    const { clients } = fakeClients({ status: 'active' });
    await expect(
      handleConnectEvent(
        prisma,
        clients,
        notification(CAPABILITY_EVENT, null),
        NOW
      )
    ).resolves.toBe('ignored');
    const person = {
      id: 'evt_2',
      type: CAPABILITY_EVENT,
      related_object: {
        id: 'person_1',
        type: 'v2.core.account_person',
        url: '',
      },
    } as unknown as Stripe.V2.Core.EventNotification;
    await expect(
      handleConnectEvent(prisma, clients, person, NOW)
    ).resolves.toBe('ignored');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', 'pending'],
    ['restricted', 'restricted'],
    [undefined, null],
  ] as const)(
    'records transfers %s without stamping the gate',
    async (status, stored) => {
      const { prisma, update, updateMany } = fakePrisma();
      const { clients } = fakeClients({ status });
      await expect(
        handleConnectEvent(prisma, clients, notification(CAPABILITY_EVENT), NOW)
      ).resolves.toBe('synced');
      expect(update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { stripeTransfersStatus: stored },
      });
      expect(updateMany).not.toHaveBeenCalled();
    }
  );

  it('acknowledges an account no organization holds without fetching it', async () => {
    const { prisma, findUnique, update, updateMany } = fakePrisma(null);
    const { clients, connectRetrieve, globalRetrieve } = fakeClients({
      status: 'active',
    });
    await expect(
      handleConnectEvent(prisma, clients, notification(CAPABILITY_EVENT), NOW)
    ).resolves.toBe('unknown_account');
    expect(findUnique).toHaveBeenCalledWith({
      where: { stripeAccountId: 'acct_1' },
      select: { id: true, stripeAccountKind: true },
    });
    expect(connectRetrieve).not.toHaveBeenCalled();
    expect(globalRetrieve).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([CAPABILITY_EVENT, 'v2.core.account[requirements].updated'])(
    'records active and stamps the gate once when %s reports it',
    async (type) => {
      const { prisma, update, updateMany } = fakePrisma({ id: 'org-9' });
      const { clients, connectRetrieve } = fakeClients({ status: 'active' });
      await expect(
        handleConnectEvent(prisma, clients, notification(type), NOW)
      ).resolves.toBe('synced');
      expect(connectRetrieve).toHaveBeenCalledWith('acct_1', {
        include: ['configuration.recipient', 'requirements'],
      });
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

  it('fetches a recipient through the preview client and reads its local bank capability', async () => {
    const { prisma, update, updateMany } = fakePrisma({
      id: 'org-jm',
      stripeAccountKind: 'GLOBAL_PAYOUTS',
    });
    const { clients, connectRetrieve, globalRetrieve } = fakeClients({
      status: 'active',
      capability: 'bank_accounts',
    });
    await expect(
      handleConnectEvent(
        prisma,
        clients,
        notification(CAPABILITY_EVENT, 'acct_jm'),
        NOW
      )
    ).resolves.toBe('synced');
    expect(globalRetrieve).toHaveBeenCalledWith('acct_jm', {
      include: ['configuration.recipient', 'requirements'],
    });
    expect(connectRetrieve).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'org-jm' },
      data: { stripeTransfersStatus: 'active' },
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
