import { describe, expect, it } from 'vitest';
import type { Actor } from '../trpc/context';
import { ConflictError, UnauthorizedError } from './_shared/errors';
import { fakeClients, fakePrisma } from './organizer-connect.test';
import { startGlobalPayoutsOnboarding } from './organizer-global-payouts';

const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };
const NOT_A_USER = { kind: 'system' } as unknown as Actor;
const BASE = 'https://app.test';
const JAMAICA = {
  country: 'JM',
  entityType: 'individual',
  baseUrl: BASE,
} as const;

describe('startGlobalPayoutsOnboarding', () => {
  it('rejects a guest', async () => {
    const { clients } = fakeClients();
    await expect(
      startGlobalPayoutsOnboarding(
        fakePrisma().prisma,
        clients,
        NOT_A_USER,
        JAMAICA
      )
    ).rejects.toThrow(UnauthorizedError);
  });

  it('refuses a country Stripe cannot pay by local bank, before touching the row', async () => {
    const { prisma, findFirst } = fakePrisma();
    const { clients, globalCalls } = fakeClients();
    await expect(
      startGlobalPayoutsOnboarding(prisma, clients, OWNER, {
        ...JAMAICA,
        country: 'BS',
      })
    ).rejects.toThrow(ConflictError);
    expect(findFirst).not.toHaveBeenCalled();
    expect(globalCalls.create).toEqual([]);
  });

  it('creates a recipient with the local bank capability, claims it, and links onboarding', async () => {
    const { prisma, updateMany } = fakePrisma();
    const { clients, connectCalls, globalCalls } = fakeClients();

    const result = await startGlobalPayoutsOnboarding(
      prisma,
      clients,
      OWNER,
      JAMAICA
    );

    expect(result.url).toContain('global#link');
    expect(globalCalls.create).toHaveLength(1);
    expect(globalCalls.create[0].params).toEqual({
      display_name: 'Island Nights',
      contact_email: 'owner@example.test',
      identity: { country: 'jm', entity_type: 'individual' },
      configuration: {
        recipient: {
          capabilities: { bank_accounts: { local: { requested: true } } },
        },
      },
      metadata: { organizationId: 'org-1' },
    });
    expect(globalCalls.create[0].options).toEqual({
      idempotencyKey: 'global-payouts-account-org-1',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'org-1', stripeAccountId: null },
      data: {
        stripeAccountId: 'acct_global',
        stripeAccountKind: 'GLOBAL_PAYOUTS',
      },
    });
    expect(globalCalls.links[0]).toEqual({
      account: 'acct_global',
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: `${BASE}/organizer/payouts/stripe/refresh`,
          return_url: `${BASE}/organizer/payouts/stripe/return`,
          collection_options: { fields: 'eventually_due' },
        },
      },
    });
    expect(connectCalls.create).toEqual([]);
    expect(connectCalls.links).toEqual([]);
  });

  it('passes a business through as a company', async () => {
    const { prisma } = fakePrisma();
    const { clients, globalCalls } = fakeClients();
    await startGlobalPayoutsOnboarding(prisma, clients, OWNER, {
      ...JAMAICA,
      country: 'TT',
      entityType: 'company',
    });
    expect(globalCalls.create[0].params).toMatchObject({
      identity: { country: 'tt', entity_type: 'company' },
    });
  });

  it('links an existing account of either kind instead of creating a second', async () => {
    const { prisma, updateMany } = fakePrisma({
      stripeAccountId: 'acct_have',
      stripeAccountKind: 'CONNECT',
    });
    const { clients, connectCalls, globalCalls } = fakeClients();

    await startGlobalPayoutsOnboarding(prisma, clients, OWNER, JAMAICA);

    expect(globalCalls.create).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
    expect(connectCalls.links[0]).toMatchObject({
      account: 'acct_have',
      use_case: {
        account_onboarding: { configurations: ['recipient', 'merchant'] },
      },
    });
  });

  it("adopts the winner's account when the claim loses a race", async () => {
    const { prisma } = fakePrisma(
      {},
      { claimCount: 0, raceId: 'acct_first', raceKind: 'CONNECT' }
    );
    const { clients, connectCalls, globalCalls } = fakeClients();

    await startGlobalPayoutsOnboarding(prisma, clients, OWNER, JAMAICA);

    expect(globalCalls.links).toEqual([]);
    expect(connectCalls.links[0]).toMatchObject({ account: 'acct_first' });
  });
});
