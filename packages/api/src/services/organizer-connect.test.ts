import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  connectStateOf,
  createStripeDashboardLink,
  finishStripeOnboardingReturn,
  getConnectSetup,
  getConnectStates,
  refreshStripeOnboarding,
  startStripeOnboarding,
  transfersStatus,
  type PayoutClients,
} from './organizer-connect';
import { NotFoundError, UnauthorizedError } from './_shared/errors';

const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };
const NOT_A_USER = { kind: 'system' } as unknown as Actor;
const NOW = new Date('2026-09-22T12:00:00Z');
const BASE = 'https://app.test';

const ORG = {
  id: 'org-1',
  displayName: 'Island Nights',
  slug: 'island-nights',
  stripeAccountId: null as string | null,
  stripeAccountKind: null as string | null,
  stripeTransfersStatus: null as string | null,
  payoutBankLinkedAt: null as Date | null,
  owner: { email: 'owner@example.test' },
};

type Status = 'active' | 'pending' | 'restricted' | 'unsupported' | 'missing';

export function fakePrisma(
  org: Partial<typeof ORG> | null = {},
  opts: { claimCount?: number; raceId?: string; raceKind?: string } = {}
) {
  const row = org === null ? null : { ...ORG, ...org };
  const findFirst = vi.fn().mockResolvedValue(row);
  const findMany = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockResolvedValue({ ...ORG, id: 'org-new' });
  const orgFindUnique = vi.fn().mockResolvedValue({
    stripeAccountId: opts.raceId ?? null,
    stripeAccountKind: opts.raceKind ?? null,
  });
  const updateMany = vi.fn().mockResolvedValue({ count: opts.claimCount ?? 1 });
  const update = vi.fn().mockResolvedValue(row);
  const prisma = {
    organization: {
      findFirst,
      findMany,
      create,
      findUnique: orgFindUnique,
      update,
      updateMany,
    },
    users: {
      findUnique: vi.fn().mockResolvedValue({
        isPlatformOwner: false,
        email: 'owner@example.test',
      }),
    },
  } as unknown as PrismaClient;
  return { prisma, findFirst, create, update, updateMany };
}

interface ClientCalls {
  create: Array<{ params: unknown; options: unknown }>;
  links: unknown[];
  retrieve: string[];
  login: string[];
}

/**
 * Two fakes, one per client, each logging its own calls: the tests assert
 * that a Connect account only ever meets the GA client and a recipient only
 * ever meets the preview one.
 */
export function fakeClients(
  opts: {
    status?: Status;
    capability?: 'stripe_transfers' | 'bank_accounts';
    retrieveThrows?: boolean;
  } = {}
) {
  const capabilities = () => {
    const capability = { status: opts.status ?? 'active', status_details: [] };
    return opts.capability === 'bank_accounts'
      ? { bank_accounts: { local: capability } }
      : { stripe_balance: { stripe_transfers: capability } };
  };
  const account = (id: string) => ({
    id,
    configuration:
      opts.status === 'missing'
        ? undefined
        : { recipient: { capabilities: capabilities() } },
  });
  const fake = (name: string, calls: ClientCalls) =>
    ({
      v2: {
        core: {
          accounts: {
            create: async (params: unknown, options: unknown) => {
              calls.create.push({ params, options });
              return account(`acct_${name}`);
            },
            retrieve: async (id: string) => {
              calls.retrieve.push(id);
              if (opts.retrieveThrows) throw new Error('stripe down');
              return account(id);
            },
          },
          accountLinks: {
            create: async (params: unknown) => {
              calls.links.push(params);
              return { url: `https://accounts.stripe.com/${name}#link` };
            },
          },
        },
      },
      accounts: {
        createLoginLink: async (id: string) => {
          calls.login.push(id);
          return { url: 'https://stripe.com/express/x' };
        },
      },
    }) as unknown;
  const connectCalls: ClientCalls = {
    create: [],
    links: [],
    retrieve: [],
    login: [],
  };
  const globalCalls: ClientCalls = {
    create: [],
    links: [],
    retrieve: [],
    login: [],
  };
  const clients = {
    connect: fake('connect', connectCalls),
    global: fake('global', globalCalls),
  } as PayoutClients;
  return { clients, connectCalls, globalCalls };
}

describe('transfersStatus', () => {
  it('reads the transfers capability on a Connect account', () => {
    expect(
      transfersStatus({
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { status: 'pending' } },
            },
          },
        },
      })
    ).toBe('pending');
  });

  it('reads the local bank capability on a recipient', () => {
    expect(
      transfersStatus({
        configuration: {
          recipient: {
            capabilities: { bank_accounts: { local: { status: 'active' } } },
          },
        },
      })
    ).toBe('active');
  });

  it('is undefined without either', () => {
    expect(transfersStatus({ configuration: null })).toBeUndefined();
  });
});

describe('connectStateOf', () => {
  it('is manual without an account', () => {
    expect(
      connectStateOf({
        stripeAccountId: null,
        stripeTransfersStatus: null,
        payoutBankLinkedAt: null,
      })
    ).toBe('manual');
  });

  it.each([
    ['active', false, 'active'],
    ['pending', false, 'pending'],
    ['restricted', false, 'in_progress'],
    ['restricted', true, 'needs_updates'],
    ['unsupported', true, 'needs_updates'],
    [null, false, 'in_progress'],
  ] as const)(
    'maps status %s with linked=%s to %s',
    (status, linked, expected) => {
      expect(
        connectStateOf({
          stripeAccountId: 'acct_1',
          stripeTransfersStatus: status,
          payoutBankLinkedAt: linked ? NOW : null,
        })
      ).toBe(expected);
    }
  );
});

describe('getConnectStates', () => {
  it('maps only rows with an account', () => {
    const states = getConnectStates([
      {
        id: 'a',
        stripeAccountId: 'acct_a',
        stripeTransfersStatus: 'pending',
        payoutBankLinkedAt: null,
      },
      {
        id: 'b',
        stripeAccountId: null,
        stripeTransfersStatus: null,
        payoutBankLinkedAt: null,
      },
    ]);
    expect(states).toEqual({ a: 'pending' });
  });
});

describe('getConnectSetup', () => {
  it('is manual for a user without an organization', async () => {
    const { prisma } = fakePrisma(null);
    await expect(getConnectSetup(prisma, OWNER)).resolves.toEqual({
      accountId: null,
      kind: null,
      state: 'manual',
    });
  });

  it('returns the account id, kind and mirrored state and writes nothing', async () => {
    const { prisma, update, updateMany } = fakePrisma({
      stripeAccountId: 'acct_1',
      stripeAccountKind: 'GLOBAL_PAYOUTS',
      stripeTransfersStatus: 'active',
    });
    await expect(getConnectSetup(prisma, OWNER)).resolves.toEqual({
      accountId: 'acct_1',
      kind: 'GLOBAL_PAYOUTS',
      state: 'active',
    });
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('reads an unknown kind as null', async () => {
    const { prisma } = fakePrisma({
      stripeAccountId: 'acct_1',
      stripeAccountKind: 'SOMETHING_ELSE',
    });
    await expect(getConnectSetup(prisma, OWNER)).resolves.toMatchObject({
      kind: null,
    });
  });
});

describe('startStripeOnboarding', () => {
  it('rejects a guest', async () => {
    const { clients } = fakeClients();
    await expect(
      startStripeOnboarding(fakePrisma().prisma, clients, NOT_A_USER, {
        baseUrl: BASE,
      })
    ).rejects.toThrow(UnauthorizedError);
  });

  it('provisions an Organization for a first-time organizer, then connects', async () => {
    const { prisma, findFirst, create } = fakePrisma(null);
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ ...ORG, id: 'org-new' });
    const { clients, connectCalls } = fakeClients();

    const result = await startStripeOnboarding(prisma, clients, OWNER, {
      baseUrl: BASE,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: 'owner-1',
        displayName: 'owner@example.test',
      }),
    });
    expect(connectCalls.create[0].params).toMatchObject({
      metadata: { organizationId: 'org-new' },
    });
    expect(result.url).toContain('accounts.stripe.com');
  });

  it('creates a recipient-only Express account, claims it as Connect, and links onboarding', async () => {
    const { prisma, updateMany } = fakePrisma();
    const { clients, connectCalls, globalCalls } = fakeClients();

    const result = await startStripeOnboarding(prisma, clients, OWNER, {
      baseUrl: BASE,
    });

    expect(result.url).toContain('accounts.stripe.com');
    expect(connectCalls.create).toHaveLength(1);
    expect(connectCalls.create[0].params).toEqual({
      display_name: 'Island Nights',
      contact_email: 'owner@example.test',
      dashboard: 'express',
      identity: { country: 'us' },
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
        profile: { business_url: `${BASE}/o/island-nights` },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: { stripe_transfers: { requested: true } },
          },
        },
        merchant: {
          capabilities: { card_payments: { requested: true } },
        },
      },
      metadata: { organizationId: 'org-1' },
    });
    expect(connectCalls.create[0].options).toEqual({
      idempotencyKey: 'connect-account-org-1',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'org-1', stripeAccountId: null },
      data: { stripeAccountId: 'acct_connect', stripeAccountKind: 'CONNECT' },
    });
    expect(connectCalls.links[0]).toEqual({
      account: 'acct_connect',
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient', 'merchant'],
          refresh_url: `${BASE}/organizer/payouts/stripe/refresh`,
          return_url: `${BASE}/organizer/payouts/stripe/return`,
          collection_options: { fields: 'eventually_due' },
        },
      },
    });
    expect(globalCalls.create).toEqual([]);
    expect(globalCalls.links).toEqual([]);
  });

  it('leaves the business URL to the form when the app runs on http', async () => {
    const { prisma } = fakePrisma();
    const { clients, connectCalls } = fakeClients();

    await startStripeOnboarding(prisma, clients, OWNER, {
      baseUrl: 'http://localhost:3000',
    });

    const params = connectCalls.create[0].params as {
      defaults: { profile?: unknown };
    };
    expect(params.defaults.profile).toBeUndefined();
  });

  it('reuses an existing account without creating another', async () => {
    const { prisma, updateMany } = fakePrisma({ stripeAccountId: 'acct_have' });
    const { clients, connectCalls } = fakeClients();

    await startStripeOnboarding(prisma, clients, OWNER, { baseUrl: BASE });

    expect(connectCalls.create).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
    expect(connectCalls.links[0]).toMatchObject({ account: 'acct_have' });
  });

  it('links an existing recipient through the preview client with the recipient configuration only', async () => {
    const { prisma } = fakePrisma({
      stripeAccountId: 'acct_jm',
      stripeAccountKind: 'GLOBAL_PAYOUTS',
    });
    const { clients, connectCalls, globalCalls } = fakeClients();

    const result = await startStripeOnboarding(prisma, clients, OWNER, {
      baseUrl: BASE,
    });

    expect(result.url).toContain('global#link');
    expect(connectCalls.links).toEqual([]);
    expect(globalCalls.links[0]).toMatchObject({
      account: 'acct_jm',
      use_case: {
        account_onboarding: { configurations: ['recipient'] },
      },
    });
  });

  it("adopts the winner's account, and its kind, when the claim loses a race", async () => {
    const { prisma } = fakePrisma(
      {},
      { claimCount: 0, raceId: 'acct_first', raceKind: 'GLOBAL_PAYOUTS' }
    );
    const { clients, globalCalls } = fakeClients();

    await startStripeOnboarding(prisma, clients, OWNER, { baseUrl: BASE });

    expect(globalCalls.links[0]).toMatchObject({ account: 'acct_first' });
  });
});

describe('refreshStripeOnboarding', () => {
  it('has nothing to refresh without an account', async () => {
    const { prisma } = fakePrisma();
    const { clients, connectCalls } = fakeClients();
    await expect(
      refreshStripeOnboarding(prisma, clients, OWNER, { baseUrl: BASE })
    ).resolves.toEqual({ url: null });
    expect(connectCalls.links).toEqual([]);
  });

  it('mints a fresh onboarding link for an existing account', async () => {
    const { prisma } = fakePrisma({ stripeAccountId: 'acct_1' });
    const { clients, connectCalls } = fakeClients();
    const result = await refreshStripeOnboarding(prisma, clients, OWNER, {
      baseUrl: BASE,
    });
    expect(result.url).toContain('accounts.stripe.com');
    expect(connectCalls.links[0]).toMatchObject({ account: 'acct_1' });
  });
});

describe('finishStripeOnboardingReturn', () => {
  it('is incomplete without an account and does not ask Stripe', async () => {
    const { prisma } = fakePrisma();
    const { clients, connectCalls } = fakeClients();
    await expect(
      finishStripeOnboardingReturn(prisma, clients, OWNER, NOW)
    ).resolves.toBe('incomplete');
    expect(connectCalls.retrieve).toEqual([]);
  });

  it('records the status and stamps the gate once when transfers are active', async () => {
    const { prisma, update, updateMany } = fakePrisma({
      stripeAccountId: 'acct_1',
    });
    const { clients, connectCalls } = fakeClients({ status: 'active' });

    await expect(
      finishStripeOnboardingReturn(prisma, clients, OWNER, NOW)
    ).resolves.toBe('active');

    expect(connectCalls.retrieve).toEqual(['acct_1']);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { stripeTransfersStatus: 'active' },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'org-1', payoutBankLinkedAt: null },
      data: { payoutBankLinkedAt: NOW },
    });
  });

  it('reads a recipient through the preview client and its local bank capability', async () => {
    const { prisma, update, updateMany } = fakePrisma({
      stripeAccountId: 'acct_jm',
      stripeAccountKind: 'GLOBAL_PAYOUTS',
    });
    const { clients, connectCalls, globalCalls } = fakeClients({
      status: 'active',
      capability: 'bank_accounts',
    });

    await expect(
      finishStripeOnboardingReturn(prisma, clients, OWNER, NOW)
    ).resolves.toBe('active');

    expect(globalCalls.retrieve).toEqual(['acct_jm']);
    expect(connectCalls.retrieve).toEqual([]);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { stripeTransfersStatus: 'active' },
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['pending', 'pending'],
    ['restricted', 'incomplete'],
  ] as const)('records %s as %s without stamping', async (status, expected) => {
    const { prisma, update, updateMany } = fakePrisma({
      stripeAccountId: 'acct_1',
    });
    const { clients } = fakeClients({ status });
    await expect(
      finishStripeOnboardingReturn(prisma, clients, OWNER, NOW)
    ).resolves.toBe(expected);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { stripeTransfersStatus: status },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('records a missing capability as null', async () => {
    const { prisma, update } = fakePrisma({ stripeAccountId: 'acct_1' });
    const { clients } = fakeClients({ status: 'missing' });
    await expect(
      finishStripeOnboardingReturn(prisma, clients, OWNER, NOW)
    ).resolves.toBe('incomplete');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { stripeTransfersStatus: null },
    });
  });

  it('treats an unreachable Stripe as pending and leaves the row alone', async () => {
    const { prisma, update, updateMany } = fakePrisma({
      stripeAccountId: 'acct_1',
    });
    const { clients } = fakeClients({ retrieveThrows: true });
    await expect(
      finishStripeOnboardingReturn(prisma, clients, OWNER, NOW)
    ).resolves.toBe('pending');
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('createStripeDashboardLink', () => {
  it('needs an account', async () => {
    const { prisma } = fakePrisma();
    const { clients } = fakeClients();
    await expect(
      createStripeDashboardLink(prisma, clients.connect, OWNER)
    ).rejects.toThrow(NotFoundError);
  });

  it('returns a login link for a Connect account', async () => {
    const { prisma } = fakePrisma({ stripeAccountId: 'acct_1' });
    const { clients, connectCalls } = fakeClients();
    await expect(
      createStripeDashboardLink(prisma, clients.connect, OWNER)
    ).resolves.toEqual({ url: 'https://stripe.com/express/x' });
    expect(connectCalls.login).toEqual(['acct_1']);
  });

  it('refuses a recipient, which has no dashboard', async () => {
    const { prisma } = fakePrisma({
      stripeAccountId: 'acct_jm',
      stripeAccountKind: 'GLOBAL_PAYOUTS',
    });
    const { clients, connectCalls } = fakeClients();
    await expect(
      createStripeDashboardLink(prisma, clients.connect, OWNER)
    ).rejects.toThrow(NotFoundError);
    expect(connectCalls.login).toEqual([]);
  });
});
