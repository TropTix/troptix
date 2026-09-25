import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import type { Actor } from '../trpc/context';
import {
  connectStateOf,
  createStripeDashboardLink,
  finishStripeOnboardingReturn,
  getConnectSetup,
  getConnectStates,
  refreshStripeOnboarding,
  startStripeOnboarding,
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
  stripeTransfersStatus: null as string | null,
  payoutBankLinkedAt: null as Date | null,
  owner: { email: 'owner@example.test' },
};

type Status = 'active' | 'pending' | 'restricted' | 'unsupported' | 'missing';

function fakePrisma(
  org: Partial<typeof ORG> | null = {},
  opts: { claimCount?: number; raceId?: string } = {}
) {
  const row = org === null ? null : { ...ORG, ...org };
  const findFirst = vi.fn().mockResolvedValue(row);
  const findMany = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockResolvedValue({ ...ORG, id: 'org-new' });
  const orgFindUnique = vi
    .fn()
    .mockResolvedValue({ stripeAccountId: opts.raceId ?? null });
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

function fakeStripe(opts: { status?: Status; retrieveThrows?: boolean } = {}) {
  const calls = {
    create: [] as Array<{ params: unknown; options: unknown }>,
    links: [] as unknown[],
    retrieve: [] as string[],
    login: [] as string[],
  };
  const account = (id: string) => ({
    id,
    configuration:
      opts.status === 'missing'
        ? undefined
        : {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: {
                    status: opts.status ?? 'active',
                    status_details: [],
                  },
                },
              },
            },
          },
  });
  const stripe = {
    v2: {
      core: {
        accounts: {
          create: async (params: unknown, options: unknown) => {
            calls.create.push({ params, options });
            return account('acct_new');
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
            return { url: 'https://accounts.stripe.com/r/acct_x#link' };
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
  } as unknown as Stripe;
  return { stripe, calls };
}

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
      state: 'manual',
    });
  });

  it('returns the account id with the mirrored state and writes nothing', async () => {
    const { prisma, update, updateMany } = fakePrisma({
      stripeAccountId: 'acct_1',
      stripeTransfersStatus: 'active',
    });
    await expect(getConnectSetup(prisma, OWNER)).resolves.toEqual({
      accountId: 'acct_1',
      state: 'active',
    });
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('startStripeOnboarding', () => {
  it('rejects a guest', async () => {
    const { stripe } = fakeStripe();
    await expect(
      startStripeOnboarding(fakePrisma().prisma, stripe, NOT_A_USER, {
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
    const { stripe, calls } = fakeStripe();

    const result = await startStripeOnboarding(prisma, stripe, OWNER, {
      baseUrl: BASE,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: 'owner-1',
        displayName: 'owner@example.test',
      }),
    });
    expect(calls.create[0].params).toMatchObject({
      metadata: { organizationId: 'org-new' },
    });
    expect(result.url).toContain('accounts.stripe.com');
  });

  it('creates a recipient-only Express account, claims it, and links onboarding', async () => {
    const { prisma, updateMany } = fakePrisma();
    const { stripe, calls } = fakeStripe();

    const result = await startStripeOnboarding(prisma, stripe, OWNER, {
      baseUrl: BASE,
    });

    expect(result.url).toContain('accounts.stripe.com');
    expect(calls.create).toHaveLength(1);
    expect(calls.create[0].params).toEqual({
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
    expect(calls.create[0].options).toEqual({
      idempotencyKey: 'connect-account-org-1',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'org-1', stripeAccountId: null },
      data: { stripeAccountId: 'acct_new' },
    });
    expect(calls.links[0]).toEqual({
      account: 'acct_new',
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
  });

  it('leaves the business URL to the form when the app runs on http', async () => {
    const { prisma } = fakePrisma();
    const { stripe, calls } = fakeStripe();

    await startStripeOnboarding(prisma, stripe, OWNER, {
      baseUrl: 'http://localhost:3000',
    });

    const params = calls.create[0].params as {
      defaults: { profile?: unknown };
    };
    expect(params.defaults.profile).toBeUndefined();
  });

  it('reuses an existing account without creating another', async () => {
    const { prisma, updateMany } = fakePrisma({ stripeAccountId: 'acct_have' });
    const { stripe, calls } = fakeStripe();

    await startStripeOnboarding(prisma, stripe, OWNER, { baseUrl: BASE });

    expect(calls.create).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
    expect(calls.links[0]).toMatchObject({ account: 'acct_have' });
  });

  it("adopts the winner's id when the claim loses a race", async () => {
    const { prisma } = fakePrisma({}, { claimCount: 0, raceId: 'acct_first' });
    const { stripe, calls } = fakeStripe();

    await startStripeOnboarding(prisma, stripe, OWNER, { baseUrl: BASE });

    expect(calls.links[0]).toMatchObject({ account: 'acct_first' });
  });
});

describe('refreshStripeOnboarding', () => {
  it('has nothing to refresh without an account', async () => {
    const { prisma } = fakePrisma();
    const { stripe, calls } = fakeStripe();
    await expect(
      refreshStripeOnboarding(prisma, stripe, OWNER, { baseUrl: BASE })
    ).resolves.toEqual({ url: null });
    expect(calls.links).toEqual([]);
  });

  it('mints a fresh onboarding link for an existing account', async () => {
    const { prisma } = fakePrisma({ stripeAccountId: 'acct_1' });
    const { stripe, calls } = fakeStripe();
    const result = await refreshStripeOnboarding(prisma, stripe, OWNER, {
      baseUrl: BASE,
    });
    expect(result.url).toContain('accounts.stripe.com');
    expect(calls.links[0]).toMatchObject({ account: 'acct_1' });
  });
});

describe('finishStripeOnboardingReturn', () => {
  it('is incomplete without an account and does not ask Stripe', async () => {
    const { prisma } = fakePrisma();
    const { stripe, calls } = fakeStripe();
    await expect(
      finishStripeOnboardingReturn(prisma, stripe, OWNER, NOW)
    ).resolves.toBe('incomplete');
    expect(calls.retrieve).toEqual([]);
  });

  it('records the status and stamps the gate once when transfers are active', async () => {
    const { prisma, update, updateMany } = fakePrisma({
      stripeAccountId: 'acct_1',
    });
    const { stripe, calls } = fakeStripe({ status: 'active' });

    await expect(
      finishStripeOnboardingReturn(prisma, stripe, OWNER, NOW)
    ).resolves.toBe('active');

    expect(calls.retrieve).toEqual(['acct_1']);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { stripeTransfersStatus: 'active' },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'org-1', payoutBankLinkedAt: null },
      data: { payoutBankLinkedAt: NOW },
    });
  });

  it.each([
    ['pending', 'pending'],
    ['restricted', 'incomplete'],
  ] as const)('records %s as %s without stamping', async (status, expected) => {
    const { prisma, update, updateMany } = fakePrisma({
      stripeAccountId: 'acct_1',
    });
    const { stripe } = fakeStripe({ status });
    await expect(
      finishStripeOnboardingReturn(prisma, stripe, OWNER, NOW)
    ).resolves.toBe(expected);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { stripeTransfersStatus: status },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('records a missing capability as null', async () => {
    const { prisma, update } = fakePrisma({ stripeAccountId: 'acct_1' });
    const { stripe } = fakeStripe({ status: 'missing' });
    await expect(
      finishStripeOnboardingReturn(prisma, stripe, OWNER, NOW)
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
    const { stripe } = fakeStripe({ retrieveThrows: true });
    await expect(
      finishStripeOnboardingReturn(prisma, stripe, OWNER, NOW)
    ).resolves.toBe('pending');
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('createStripeDashboardLink', () => {
  it('needs an account', async () => {
    const { prisma } = fakePrisma();
    const { stripe } = fakeStripe();
    await expect(
      createStripeDashboardLink(prisma, stripe, OWNER)
    ).rejects.toThrow(NotFoundError);
  });

  it('returns a login link for the account', async () => {
    const { prisma } = fakePrisma({ stripeAccountId: 'acct_1' });
    const { stripe, calls } = fakeStripe();
    await expect(
      createStripeDashboardLink(prisma, stripe, OWNER)
    ).resolves.toEqual({ url: 'https://stripe.com/express/x' });
    expect(calls.login).toEqual(['acct_1']);
  });
});
