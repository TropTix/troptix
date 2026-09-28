import { vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { PayoutClients } from './organizer-connect';

/** Fakes shared by the Connect and Global Payouts onboarding suites. */
export const ORG = {
  id: 'org-1',
  displayName: 'Island Nights',
  slug: 'island-nights',
  stripeAccountId: null as string | null,
  stripeAccountKind: null as string | null,
  stripeTransfersStatus: null as string | null,
  payoutBankLinkedAt: null as Date | null,
  owner: { email: 'owner@example.test' },
};

export type Status =
  | 'active'
  | 'pending'
  | 'restricted'
  | 'unsupported'
  | 'missing';

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
