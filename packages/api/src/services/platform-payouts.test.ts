import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import type StripePreview from 'stripe-preview';
import type { Actor } from '../trpc/context';
import {
  listPayoutOrganizations,
  listPayoutRequests,
  readPlatformPayoutBalance,
  reconcileStripePayouts,
  resolvePayoutRequest,
  sendPayoutViaStripe,
  setPayoutPolicy,
  setPayoutSetupStep,
} from './platform-payouts';
import {
  ConflictError,
  InsufficientPlatformBalanceError,
  NotFoundError,
  StripeAccountRestrictedError,
  UnauthorizedError,
} from './_shared/errors';
import type { PayoutClients } from './organizer-connect';

const STAFF: Actor = { kind: 'user', userId: 'staff-1', role: 'PATRON' };
const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };

const REQUEST_ROW = {
  id: 'req-1',
  createdAt: new Date('2026-08-20T10:00:00Z'),
  status: 'REQUESTED',
  amountCents: 5000,
  note: null,
  resolvedAt: null,
  rail: null,
  reference: null,
  adminNote: null,
  organizationId: 'org-1',
  requestedByUserId: 'owner-1',
  organization: {
    displayName: 'Demo Organizer',
    slug: 'demo-organizer',
    stripeAccountId: null,
    stripeAccountKind: null,
    stripeTransfersStatus: null,
    payoutBankLinkedAt: null,
    owner: { email: 'owner@example.test' },
  },
};

interface FakeOpts {
  platformOwner?: boolean;
  requests?: unknown[];
  organizations?: unknown[];
  updatedCount?: number;
  request?: unknown;
  openSumCents?: number;
}

function fakePrisma(opts: FakeOpts = {}) {
  const requestUpdateMany = vi
    .fn()
    .mockResolvedValue({ count: opts.updatedCount ?? 1 });
  const orgUpdateMany = vi
    .fn()
    .mockResolvedValue({ count: opts.updatedCount ?? 1 });
  const requestFindMany = vi.fn().mockResolvedValue(opts.requests ?? []);
  const requestFindUnique = vi.fn().mockResolvedValue(opts.request ?? null);
  const requestAggregate = vi
    .fn()
    .mockResolvedValue({ _sum: { amountCents: opts.openSumCents ?? null } });
  const orgFindMany = vi.fn().mockResolvedValue(opts.organizations ?? []);

  const lock = vi.fn().mockResolvedValue([]);
  const prisma = {
    users: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ isPlatformOwner: opts.platformOwner ?? true }),
    },
    payoutRequest: {
      findMany: requestFindMany,
      findUnique: requestFindUnique,
      aggregate: requestAggregate,
      updateMany: requestUpdateMany,
    },
    organization: { findMany: orgFindMany, updateMany: orgUpdateMany },
    $queryRaw: lock,
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  } as unknown as PrismaClient;

  return {
    prisma,
    requestUpdateMany,
    requestAggregate,
    orgUpdateMany,
    orgFindMany,
    lock,
  };
}

interface FakeTransfer {
  id: string;
  metadata?: Record<string, string>;
  reversed?: boolean;
}

function listResult(items: FakeTransfer[]) {
  return {
    data: items,
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  };
}

function stripeError(code: string) {
  return Object.assign(new Error(code), { code });
}

interface FakePayment {
  id: string;
  status: string;
  metadata?: Record<string, string>;
}

interface FakeMethod {
  id: string;
  type?: string;
  restricted?: boolean;
  archived?: boolean;
  payments?: string;
}

function fakeStripe(
  opts: {
    existing?: FakeTransfer[];
    all?: FakeTransfer[];
    createError?: unknown;
    fundError?: unknown;
    availableUsd?: number;
  } = {}
) {
  const create = vi.fn(async (params: unknown, options: unknown) => {
    if (opts.createError) throw opts.createError;
    return { id: 'tr_new', params, options };
  });
  const list = vi.fn((params: { transfer_group?: string }) =>
    listResult(params.transfer_group ? (opts.existing ?? []) : (opts.all ?? []))
  );
  const retrieve = vi.fn(async () => ({
    available: [
      { amount: opts.availableUsd ?? 0, currency: 'usd' },
      { amount: 999, currency: 'jmd' },
    ],
  }));
  const fund = vi.fn(async (params: unknown, options: unknown) => {
    if (opts.fundError) throw opts.fundError;
    return { id: 'po_fund', params, options };
  });
  const stripe = {
    transfers: { create, list },
    balance: { retrieve },
    payouts: { create: fund },
  } as unknown as Stripe;
  return { stripe, create, list, retrieve, fund };
}

function fakeGlobal(
  opts: {
    payments?: FakePayment[];
    methods?: FakeMethod[];
    faAvailableUsd?: number;
    createError?: unknown;
  } = {}
) {
  const paymentsList = vi.fn(() => listResult(opts.payments ?? []));
  const paymentsCreate = vi.fn(async (params: unknown, options: unknown) => {
    if (opts.createError) throw opts.createError;
    return { id: 'obp_new', status: 'processing', params, options };
  });
  const methodsList = vi.fn((_params: unknown, _options: unknown) =>
    listResult(
      (opts.methods ?? [{ id: 'jmba_1' }]).map((method) => ({
        id: method.id,
        type: method.type ?? 'bank_account',
        restricted: method.restricted ?? false,
        bank_account: { archived: method.archived ?? false },
        usage_status: { payments: method.payments ?? 'eligible' },
      }))
    )
  );
  const faRetrieve = vi.fn(async () => ({
    id: 'fa_1',
    balance: {
      available:
        opts.faAvailableUsd === undefined
          ? {}
          : { usd: { value: opts.faAvailableUsd, currency: 'usd' } },
    },
  }));
  const global = {
    v2: {
      moneyManagement: {
        outboundPayments: { list: paymentsList, create: paymentsCreate },
        payoutMethods: { list: methodsList },
        financialAccounts: { retrieve: faRetrieve },
      },
    },
  } as unknown as StripePreview;
  return { global, paymentsList, paymentsCreate, methodsList, faRetrieve };
}

/** `financialAccountId: null` means the send rail is not configured. */
function clientsOf(
  stripe: Stripe,
  global: StripePreview = fakeGlobal().global,
  opts: { financialAccountId?: string | null } = {}
): PayoutClients {
  return {
    connect: stripe,
    global,
    financialAccountId:
      opts.financialAccountId === null
        ? undefined
        : (opts.financialAccountId ?? 'fa_1'),
  };
}

const OPEN_REQUEST = {
  id: 'req-1',
  status: 'REQUESTED',
  amountCents: 25000,
  organization: {
    id: 'org-1',
    slug: 'island-nights',
    stripeAccountId: 'acct_1',
    stripeAccountKind: 'CONNECT',
    stripeTransfersStatus: 'active',
    payoutBankLinkedAt: new Date('2026-09-01T00:00:00Z'),
  },
};

describe('platform payouts — the gate', () => {
  it('rejects a non-platform-owner everywhere', async () => {
    const { prisma } = fakePrisma({ platformOwner: false });
    await expect(listPayoutRequests(prisma, OWNER)).rejects.toThrow(
      UnauthorizedError
    );
    await expect(
      resolvePayoutRequest(prisma, OWNER, { id: 'req-1', outcome: 'PAID' })
    ).rejects.toThrow(UnauthorizedError);
    await expect(
      setPayoutSetupStep(prisma, OWNER, {
        organizationId: 'org-1',
        step: 'meeting',
        done: true,
      })
    ).rejects.toThrow(UnauthorizedError);
    await expect(
      setPayoutPolicy(prisma, OWNER, {
        organizationId: 'org-1',
        releaseAtSale: true,
        holdbackPercent: null,
        holdbackDays: null,
      })
    ).rejects.toThrow(UnauthorizedError);
    await expect(listPayoutOrganizations(prisma, OWNER)).rejects.toThrow(
      UnauthorizedError
    );
  });

  it('rejects an anonymous actor', async () => {
    const { prisma } = fakePrisma();
    await expect(
      listPayoutRequests(prisma, { kind: 'anonymous' })
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe('listPayoutRequests', () => {
  it('maps rows with organization and owner detail', async () => {
    const { prisma } = fakePrisma({ requests: [REQUEST_ROW] });
    const result = await listPayoutRequests(prisma, STAFF);
    expect(result).toEqual([
      {
        id: 'req-1',
        createdAt: '2026-08-20T10:00:00.000Z',
        status: 'REQUESTED',
        amountCents: 5000,
        note: null,
        resolvedAt: null,
        rail: null,
        reference: null,
        adminNote: null,
        organizationId: 'org-1',
        organizationName: 'Demo Organizer',
        organizationSlug: 'demo-organizer',
        ownerEmail: 'owner@example.test',
        stripeAccountId: null,
        stripeAccountKind: null,
        connectState: 'manual',
      },
    ]);
  });

  it('derives the Connect state and the kind from the organization row', async () => {
    const row = {
      ...REQUEST_ROW,
      organization: {
        ...REQUEST_ROW.organization,
        stripeAccountId: 'acct_1',
        stripeAccountKind: 'GLOBAL_PAYOUTS',
        stripeTransfersStatus: 'active',
        payoutBankLinkedAt: new Date('2026-09-01T00:00:00Z'),
      },
    };
    const { prisma } = fakePrisma({ requests: [row] });
    const [result] = await listPayoutRequests(prisma, STAFF);
    expect(result.stripeAccountId).toBe('acct_1');
    expect(result.stripeAccountKind).toBe('GLOBAL_PAYOUTS');
    expect(result.connectState).toBe('active');
  });
});

describe('sendPayoutViaStripe', () => {
  const NOW = new Date('2026-09-27T12:00:00Z');

  it('locks the row, creates the transfer in the request group with a fresh key, then resolves', async () => {
    const { prisma, requestUpdateMany, lock } = fakePrisma({
      request: OPEN_REQUEST,
    });
    const { stripe, create, list } = fakeStripe();

    const result = await sendPayoutViaStripe(
      prisma,
      clientsOf(stripe),
      STAFF,
      { id: 'req-1' },
      NOW
    );

    expect(result).toEqual({ reference: 'tr_new' });
    expect(lock).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({
      transfer_group: 'payout-request-req-1',
      limit: 10,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({
      amount: 25000,
      currency: 'usd',
      destination: 'acct_1',
      description: 'TropTix payout — island-nights — req-1',
      transfer_group: 'payout-request-req-1',
      metadata: { payoutRequestId: 'req-1', organizationId: 'org-1' },
    });
    expect(
      (create.mock.calls[0][1] as { idempotencyKey: string }).idempotencyKey
    ).toMatch(/^payout-request-req-1-[0-9a-f-]{36}$/);
    expect(requestUpdateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'REQUESTED' },
      data: {
        status: 'PAID',
        rail: 'STRIPE',
        reference: 'tr_new',
        resolvedAt: NOW,
        resolvedByUserId: 'staff-1',
      },
    });
  });

  it('reuses a live transfer already in the group instead of creating a second one', async () => {
    const { prisma, requestUpdateMany } = fakePrisma({ request: OPEN_REQUEST });
    const { stripe, create } = fakeStripe({ existing: [{ id: 'tr_old' }] });

    const result = await sendPayoutViaStripe(prisma, clientsOf(stripe), STAFF, {
      id: 'req-1',
    });

    expect(result.reference).toBe('tr_old');
    expect(create).not.toHaveBeenCalled();
    expect(requestUpdateMany.mock.calls[0][0].data.reference).toBe('tr_old');
  });

  it('does not reuse a reversed transfer', async () => {
    const { prisma } = fakePrisma({ request: OPEN_REQUEST });
    const { stripe, create } = fakeStripe({
      existing: [{ id: 'tr_reversed', reversed: true }],
    });

    const result = await sendPayoutViaStripe(prisma, clientsOf(stripe), STAFF, {
      id: 'req-1',
    });

    expect(result.reference).toBe('tr_new');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('uses a different idempotency key on each attempt so a cached failure is not replayed', async () => {
    const { prisma } = fakePrisma({ request: OPEN_REQUEST });
    const { stripe, create } = fakeStripe();
    await sendPayoutViaStripe(prisma, clientsOf(stripe), STAFF, {
      id: 'req-1',
    });
    await sendPayoutViaStripe(prisma, clientsOf(stripe), STAFF, {
      id: 'req-1',
    });
    const keys = create.mock.calls.map(
      (call) => (call[1] as { idempotencyKey: string }).idempotencyKey
    );
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('maps balance_insufficient to the typed error with the shortfall and leaves the row alone', async () => {
    const { prisma, requestUpdateMany } = fakePrisma({ request: OPEN_REQUEST });
    const { stripe } = fakeStripe({
      createError: stripeError('balance_insufficient'),
      availableUsd: 10000,
    });

    const error = await sendPayoutViaStripe(prisma, clientsOf(stripe), STAFF, {
      id: 'req-1',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InsufficientPlatformBalanceError);
    expect((error as InsufficientPlatformBalanceError).shortfallCents).toBe(
      15000
    );
    expect(requestUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    'transfers_not_allowed',
    'insufficient_capabilities_for_transfer',
    'account_invalid',
  ])('maps %s to the restricted-account error', async (code) => {
    const { prisma } = fakePrisma({ request: OPEN_REQUEST });
    const { stripe } = fakeStripe({ createError: stripeError(code) });
    await expect(
      sendPayoutViaStripe(prisma, clientsOf(stripe), STAFF, { id: 'req-1' })
    ).rejects.toThrow(StripeAccountRestrictedError);
  });

  it('refuses an organization whose account is not active without touching Stripe', async () => {
    const { stripe, create, list } = fakeStripe();
    for (const status of ['pending', 'restricted', null]) {
      const { prisma } = fakePrisma({
        request: {
          ...OPEN_REQUEST,
          organization: {
            ...OPEN_REQUEST.organization,
            stripeTransfersStatus: status,
          },
        },
      });
      await expect(
        sendPayoutViaStripe(prisma, clientsOf(stripe), STAFF, { id: 'req-1' })
      ).rejects.toThrow(ConflictError);
    }
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rethrows any other Stripe failure untouched', async () => {
    const { prisma } = fakePrisma({ request: OPEN_REQUEST });
    const boom = stripeError('api_connection_error');
    const { stripe } = fakeStripe({ createError: boom });
    await expect(
      sendPayoutViaStripe(prisma, clientsOf(stripe), STAFF, { id: 'req-1' })
    ).rejects.toBe(boom);
  });

  it('reports the transfer id when the resolve wrote no rows', async () => {
    const { prisma } = fakePrisma({ request: OPEN_REQUEST, updatedCount: 0 });
    const { stripe } = fakeStripe();
    await expect(
      sendPayoutViaStripe(prisma, clientsOf(stripe), STAFF, { id: 'req-1' })
    ).rejects.toThrow(/tr_new/);
  });

  it('refuses a request that is not open, an organization without an account, and a non-owner', async () => {
    const { stripe, create } = fakeStripe();

    const resolved = fakePrisma({
      request: { ...OPEN_REQUEST, status: 'PAID' },
    });
    await expect(
      sendPayoutViaStripe(resolved.prisma, clientsOf(stripe), STAFF, {
        id: 'req-1',
      })
    ).rejects.toThrow(ConflictError);

    const manual = fakePrisma({
      request: {
        ...OPEN_REQUEST,
        organization: { ...OPEN_REQUEST.organization, stripeAccountId: null },
      },
    });
    await expect(
      sendPayoutViaStripe(manual.prisma, clientsOf(stripe), STAFF, {
        id: 'req-1',
      })
    ).rejects.toThrow(ConflictError);

    const missing = fakePrisma();
    await expect(
      sendPayoutViaStripe(missing.prisma, clientsOf(stripe), STAFF, {
        id: 'req-1',
      })
    ).rejects.toThrow(NotFoundError);

    const owner = fakePrisma({ platformOwner: false, request: OPEN_REQUEST });
    await expect(
      sendPayoutViaStripe(owner.prisma, clientsOf(stripe), OWNER, {
        id: 'req-1',
      })
    ).rejects.toThrow(UnauthorizedError);

    expect(create).not.toHaveBeenCalled();
  });
});

describe('sendPayoutViaStripe — Global Payouts', () => {
  const NOW = new Date('2026-09-27T12:00:00Z');
  const GP_REQUEST = {
    ...OPEN_REQUEST,
    createdAt: new Date('2026-09-20T00:00:00Z'),
    organization: {
      ...OPEN_REQUEST.organization,
      stripeAccountId: 'acct_jm',
      stripeAccountKind: 'GLOBAL_PAYOUTS',
    },
  };

  it('names the payout method, tops the financial account up with headroom, creates the payment with the request key, then resolves', async () => {
    const { prisma, requestUpdateMany } = fakePrisma({ request: GP_REQUEST });
    const {
      stripe,
      fund,
      create: transfer,
    } = fakeStripe({ availableUsd: 100000 });
    const { global, paymentsCreate, methodsList, paymentsList } = fakeGlobal({
      faAvailableUsd: 1000,
    });

    const result = await sendPayoutViaStripe(
      prisma,
      clientsOf(stripe, global),
      STAFF,
      { id: 'req-1' },
      NOW
    );

    expect(result).toEqual({ reference: 'obp_new' });
    expect(transfer).not.toHaveBeenCalled();
    expect(paymentsList).toHaveBeenCalledWith({
      recipient: 'acct_jm',
      created_gte: '2026-09-20T00:00:00.000Z',
      limit: 100,
    });
    expect(methodsList.mock.calls[0][1]).toEqual({ stripeContext: 'acct_jm' });
    // 25000 + ceil(25000 * 2.25%) + 150 = 25713 needed, 1000 there.
    expect(fund).toHaveBeenCalledTimes(1);
    expect(fund.mock.calls[0][0]).toEqual({
      amount: 24713,
      currency: 'usd',
      payout_method: 'fa_1',
      description: 'TropTix payout — island-nights — req-1',
      metadata: { payoutRequestId: 'req-1' },
    });
    expect(paymentsCreate.mock.calls[0][0]).toEqual({
      from: { financial_account: 'fa_1', currency: 'usd' },
      to: { recipient: 'acct_jm', payout_method: 'jmba_1' },
      amount: { value: 25000, currency: 'usd' },
      description: 'TropTix payout — island-nights — req-1',
      metadata: { payoutRequestId: 'req-1', organizationId: 'org-1' },
    });
    expect(paymentsCreate.mock.calls[0][1]).toEqual({
      idempotencyKey: 'global-payout-req-1',
    });
    expect(requestUpdateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'REQUESTED' },
      data: {
        status: 'PAID',
        rail: 'STRIPE',
        reference: 'obp_new',
        resolvedAt: NOW,
        resolvedByUserId: 'staff-1',
      },
    });
  });

  it('skips the top-up when the financial account already covers amount plus headroom', async () => {
    const { prisma } = fakePrisma({ request: GP_REQUEST });
    const { stripe, fund } = fakeStripe();
    const { global, paymentsCreate } = fakeGlobal({ faAvailableUsd: 25713 });
    await sendPayoutViaStripe(prisma, clientsOf(stripe, global), STAFF, {
      id: 'req-1',
    });
    expect(fund).not.toHaveBeenCalled();
    expect(paymentsCreate).toHaveBeenCalledTimes(1);
  });

  it('reuses a live payment for the request and ignores one that failed or came back', async () => {
    const { prisma, requestUpdateMany } = fakePrisma({ request: GP_REQUEST });
    const { stripe, fund } = fakeStripe();
    const { global, paymentsCreate } = fakeGlobal({
      payments: [
        {
          id: 'obp_other',
          status: 'posted',
          metadata: { payoutRequestId: 'x' },
        },
        {
          id: 'obp_returned',
          status: 'returned',
          metadata: { payoutRequestId: 'req-1' },
        },
        {
          id: 'obp_live',
          status: 'processing',
          metadata: { payoutRequestId: 'req-1' },
        },
      ],
    });

    const result = await sendPayoutViaStripe(
      prisma,
      clientsOf(stripe, global),
      STAFF,
      { id: 'req-1' }
    );

    expect(result.reference).toBe('obp_live');
    expect(fund).not.toHaveBeenCalled();
    expect(paymentsCreate).not.toHaveBeenCalled();
    expect(requestUpdateMany.mock.calls[0][0].data.reference).toBe('obp_live');
  });

  it('skips a restricted, archived, or ineligible payout method and refuses when none is usable', async () => {
    const { prisma } = fakePrisma({ request: GP_REQUEST });
    const { stripe } = fakeStripe();
    const picked = fakeGlobal({
      faAvailableUsd: 100000,
      methods: [
        { id: 'jmba_restricted', restricted: true },
        { id: 'jmba_archived', archived: true },
        { id: 'jmba_disabled', payments: 'disabled' },
        { id: 'card_1', type: 'card' },
        { id: 'jmba_ok' },
      ],
    });
    await sendPayoutViaStripe(prisma, clientsOf(stripe, picked.global), STAFF, {
      id: 'req-1',
    });
    expect(picked.paymentsCreate.mock.calls[0][0]).toMatchObject({
      to: { payout_method: 'jmba_ok' },
    });

    const none = fakeGlobal({
      methods: [{ id: 'jmba_restricted', restricted: true }],
    });
    const { prisma: prisma2, requestUpdateMany } = fakePrisma({
      request: GP_REQUEST,
    });
    await expect(
      sendPayoutViaStripe(prisma2, clientsOf(stripe, none.global), STAFF, {
        id: 'req-1',
      })
    ).rejects.toThrow(StripeAccountRestrictedError);
    expect(none.paymentsCreate).not.toHaveBeenCalled();
    expect(requestUpdateMany).not.toHaveBeenCalled();
  });

  it('maps a short payments balance on the top-up to the insufficient-balance error', async () => {
    const { prisma, requestUpdateMany } = fakePrisma({ request: GP_REQUEST });
    const { stripe } = fakeStripe({
      fundError: stripeError('balance_insufficient'),
      availableUsd: 10000,
    });
    const { global, paymentsCreate } = fakeGlobal({ faAvailableUsd: 0 });

    const error = await sendPayoutViaStripe(
      prisma,
      clientsOf(stripe, global),
      STAFF,
      { id: 'req-1' }
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InsufficientPlatformBalanceError);
    expect((error as InsufficientPlatformBalanceError).shortfallCents).toBe(
      15713
    );
    expect(paymentsCreate).not.toHaveBeenCalled();
    expect(requestUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['insufficient_funds', ConflictError],
    ['outbound_payment_cannot_be_processed', ConflictError],
    ['recipient_feature_not_active', StripeAccountRestrictedError],
    ['payout_method_disabled', StripeAccountRestrictedError],
    ['account_not_configured_as_recipient', StripeAccountRestrictedError],
  ])('maps %s on the payment create', async (code, errorClass) => {
    const { prisma, requestUpdateMany } = fakePrisma({ request: GP_REQUEST });
    const { stripe } = fakeStripe();
    const { global } = fakeGlobal({
      faAvailableUsd: 100000,
      createError: stripeError(code),
    });
    await expect(
      sendPayoutViaStripe(prisma, clientsOf(stripe, global), STAFF, {
        id: 'req-1',
      })
    ).rejects.toThrow(errorClass);
    expect(requestUpdateMany).not.toHaveBeenCalled();
  });

  it('reads the v2 error type when no code is set', async () => {
    const { prisma } = fakePrisma({ request: GP_REQUEST });
    const { stripe } = fakeStripe();
    const { global } = fakeGlobal({
      faAvailableUsd: 100000,
      createError: Object.assign(new Error('short'), {
        rawType: 'insufficient_funds',
      }),
    });
    await expect(
      sendPayoutViaStripe(prisma, clientsOf(stripe, global), STAFF, {
        id: 'req-1',
      })
    ).rejects.toThrow(ConflictError);
  });

  it('refuses without a financial account before touching Stripe', async () => {
    const { prisma } = fakePrisma({ request: GP_REQUEST });
    const { stripe } = fakeStripe();
    const { global, paymentsList } = fakeGlobal();
    await expect(
      sendPayoutViaStripe(
        prisma,
        clientsOf(stripe, global, { financialAccountId: null }),
        STAFF,
        {
          id: 'req-1',
        }
      )
    ).rejects.toThrow(ConflictError);
    expect(paymentsList).not.toHaveBeenCalled();
  });
});

describe('readPlatformPayoutBalance', () => {
  it('sums the USD available balance against open Stripe-rail requests only', async () => {
    const { prisma, requestAggregate } = fakePrisma({ openSumCents: 30000 });
    const { stripe } = fakeStripe({ availableUsd: 12345 });
    await expect(
      readPlatformPayoutBalance(prisma, clientsOf(stripe), STAFF)
    ).resolves.toEqual({ availableCents: 12345, openRequestsCents: 30000 });
    expect(requestAggregate.mock.calls[0][0].where).toEqual({
      status: 'REQUESTED',
      organization: {
        stripeAccountId: { not: null },
        stripeTransfersStatus: 'active',
      },
    });
  });

  it('reads zero open requests as zero', async () => {
    const { prisma } = fakePrisma();
    const { stripe } = fakeStripe();
    const result = await readPlatformPayoutBalance(
      prisma,
      clientsOf(stripe),
      STAFF
    );
    expect(result.openRequestsCents).toBe(0);
  });

  it('adds the financial account when one is configured', async () => {
    const { prisma } = fakePrisma();
    const { stripe } = fakeStripe({ availableUsd: 1000 });
    const { global, faRetrieve } = fakeGlobal({ faAvailableUsd: 250 });
    await expect(
      readPlatformPayoutBalance(prisma, clientsOf(stripe, global), STAFF)
    ).resolves.toMatchObject({ availableCents: 1250 });
    await expect(
      readPlatformPayoutBalance(
        prisma,
        clientsOf(stripe, global, { financialAccountId: null }),
        STAFF
      )
    ).resolves.toMatchObject({ availableCents: 1000 });
    expect(faRetrieve).toHaveBeenCalledTimes(1);
  });
});

describe('reconcileStripePayouts', () => {
  const NOW = new Date('2026-09-27T12:00:00Z');
  const rows = [
    { id: 'open-clean', status: 'REQUESTED', rail: null },
    { id: 'open-sent', status: 'REQUESTED', rail: null },
    { id: 'paid-clean', status: 'PAID', rail: 'STRIPE' },
    { id: 'paid-missing', status: 'PAID', rail: 'STRIPE' },
    { id: 'paid-twice', status: 'PAID', rail: 'STRIPE' },
    { id: 'paid-reversed-only', status: 'PAID', rail: 'STRIPE' },
    { id: 'cancelled-sent', status: 'CANCELLED', rail: null },
    { id: 'paid-mercury-sent', status: 'PAID', rail: 'MERCURY' },
  ];
  const transfers: FakeTransfer[] = [
    { id: 'tr_a', metadata: { payoutRequestId: 'open-sent' } },
    { id: 'tr_b', metadata: { payoutRequestId: 'paid-clean' } },
    { id: 'tr_c', metadata: { payoutRequestId: 'paid-twice' } },
    { id: 'tr_d', metadata: { payoutRequestId: 'paid-twice' } },
    { id: 'tr_e', metadata: {} },
    {
      id: 'tr_f',
      metadata: { payoutRequestId: 'paid-reversed-only' },
      reversed: true,
    },
    { id: 'tr_g', metadata: { payoutRequestId: 'cancelled-sent' } },
    { id: 'tr_h', metadata: { payoutRequestId: 'paid-mercury-sent' } },
    { id: 'tr_i', metadata: { payoutRequestId: 'deleted-row' } },
  ];

  it('flags every mismatch kind, ignores reversed transfers, and nothing else', async () => {
    const { prisma } = fakePrisma({ requests: rows });
    const { stripe, list } = fakeStripe({ all: transfers });

    const result = await reconcileStripePayouts(
      prisma,
      clientsOf(stripe, fakeGlobal().global, { financialAccountId: null }),
      {
        now: NOW,
        windowDays: 35,
      }
    );

    expect(result).toEqual([
      {
        requestId: 'open-sent',
        kind: 'requested_with_transfer',
        stripeIds: ['tr_a'],
      },
      {
        requestId: 'paid-missing',
        kind: 'paid_without_transfer',
        stripeIds: [],
      },
      {
        requestId: 'paid-twice',
        kind: 'duplicate_transfer',
        stripeIds: ['tr_c', 'tr_d'],
      },
      {
        requestId: 'paid-reversed-only',
        kind: 'paid_without_transfer',
        stripeIds: [],
      },
      {
        requestId: 'cancelled-sent',
        kind: 'closed_with_transfer',
        stripeIds: ['tr_g'],
      },
      {
        requestId: 'paid-mercury-sent',
        kind: 'closed_with_transfer',
        stripeIds: ['tr_h'],
      },
      {
        requestId: 'deleted-row',
        kind: 'transfer_without_request',
        stripeIds: ['tr_i'],
      },
    ]);
    expect(list).toHaveBeenCalledWith({
      created: { gte: Math.floor((NOW.getTime() - 35 * 86_400_000) / 1000) },
      limit: 100,
    });
  });

  it('returns nothing when rows and transfers agree', async () => {
    const { prisma } = fakePrisma({
      requests: [{ id: 'paid-clean', status: 'PAID', rail: 'STRIPE' }],
    });
    const { stripe } = fakeStripe({
      all: [{ id: 'tr_b', metadata: { payoutRequestId: 'paid-clean' } }],
    });
    await expect(
      reconcileStripePayouts(
        prisma,
        clientsOf(stripe, fakeGlobal().global, { financialAccountId: null }),
        { now: NOW }
      )
    ).resolves.toEqual([]);
  });

  it('sweeps outbound payments too, flagging a paid row whose payment failed or came back', async () => {
    const { prisma } = fakePrisma({
      requests: [
        { id: 'paid-obp', status: 'PAID', rail: 'STRIPE' },
        { id: 'paid-returned', status: 'PAID', rail: 'STRIPE' },
        { id: 'paid-resent', status: 'PAID', rail: 'STRIPE' },
        { id: 'open-obp', status: 'REQUESTED', rail: null },
      ],
    });
    const { stripe } = fakeStripe({ all: [] });
    const { global, paymentsList } = fakeGlobal({
      payments: [
        {
          id: 'obp_a',
          status: 'posted',
          metadata: { payoutRequestId: 'paid-obp' },
        },
        {
          id: 'obp_b',
          status: 'returned',
          metadata: { payoutRequestId: 'paid-returned' },
        },
        {
          id: 'obp_c',
          status: 'failed',
          metadata: { payoutRequestId: 'paid-resent' },
        },
        {
          id: 'obp_d',
          status: 'processing',
          metadata: { payoutRequestId: 'paid-resent' },
        },
        {
          id: 'obp_e',
          status: 'processing',
          metadata: { payoutRequestId: 'open-obp' },
        },
        { id: 'obp_f', status: 'posted', metadata: {} },
      ],
    });

    const result = await reconcileStripePayouts(
      prisma,
      clientsOf(stripe, global),
      { now: NOW, windowDays: 35 }
    );

    expect(result).toEqual([
      {
        requestId: 'paid-returned',
        kind: 'payment_returned',
        stripeIds: ['obp_b'],
      },
      {
        requestId: 'open-obp',
        kind: 'requested_with_transfer',
        stripeIds: ['obp_e'],
      },
    ]);
    expect(paymentsList).toHaveBeenCalledWith({
      created_gte: new Date(NOW.getTime() - 35 * 86_400_000).toISOString(),
      limit: 100,
    });
  });

  it('leaves outbound payments alone when no financial account is configured', async () => {
    const { prisma } = fakePrisma();
    const { stripe } = fakeStripe();
    const { global, paymentsList } = fakeGlobal();
    await reconcileStripePayouts(
      prisma,
      clientsOf(stripe, global, { financialAccountId: null }),
      {
        now: NOW,
      }
    );
    expect(paymentsList).not.toHaveBeenCalled();
  });

  it('asks the database for the rows the transfers point at', async () => {
    const { prisma } = fakePrisma();
    const { stripe } = fakeStripe({
      all: [{ id: 'tr_z', metadata: { payoutRequestId: 'some-row' } }],
    });
    await reconcileStripePayouts(
      prisma,
      clientsOf(stripe, fakeGlobal().global, { financialAccountId: null }),
      { now: NOW }
    );
    const where = (prisma.payoutRequest.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].where;
    expect(where.OR[2]).toEqual({ id: { in: ['some-row'] } });
  });
});

describe('resolvePayoutRequest', () => {
  it('marks paid with the rail defaulted to MERCURY and stamps the resolver', async () => {
    const { prisma, requestUpdateMany } = fakePrisma();
    await resolvePayoutRequest(prisma, STAFF, {
      id: 'req-1',
      outcome: 'PAID',
      reference: ' MERC-123 ',
    });

    const call = requestUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'req-1', status: 'REQUESTED' });
    expect(call.data).toMatchObject({
      status: 'PAID',
      resolvedByUserId: 'staff-1',
      rail: 'MERCURY',
      reference: 'MERC-123',
    });
    expect(call.data.resolvedAt).toBeInstanceOf(Date);
  });

  it('rejects only with a note, and never writes a rail', async () => {
    const { prisma, requestUpdateMany } = fakePrisma();
    await expect(
      resolvePayoutRequest(prisma, STAFF, { id: 'req-1', outcome: 'REJECTED' })
    ).rejects.toThrow(ConflictError);

    await resolvePayoutRequest(prisma, STAFF, {
      id: 'req-1',
      outcome: 'REJECTED',
      adminNote: 'Amount disputed',
    });
    const call = requestUpdateMany.mock.calls[0][0];
    expect(call.data).toMatchObject({
      status: 'REJECTED',
      adminNote: 'Amount disputed',
    });
    expect(call.data).not.toHaveProperty('rail');
  });

  it('throws when the request was already resolved or cancelled', async () => {
    const { prisma } = fakePrisma({ updatedCount: 0 });
    await expect(
      resolvePayoutRequest(prisma, STAFF, { id: 'req-1', outcome: 'PAID' })
    ).rejects.toThrow(ConflictError);
  });
});

describe('setPayoutSetupStep', () => {
  it('stamps the matching timestamp', async () => {
    const { prisma, orgUpdateMany } = fakePrisma();
    await setPayoutSetupStep(prisma, STAFF, {
      organizationId: 'org-1',
      step: 'bank',
      done: true,
    });

    const call = orgUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'org-1' });
    expect(call.data.payoutBankLinkedAt).toBeInstanceOf(Date);
  });

  it('clears the timestamp when unchecked', async () => {
    const { prisma, orgUpdateMany } = fakePrisma();
    await setPayoutSetupStep(prisma, STAFF, {
      organizationId: 'org-1',
      step: 'meeting',
      done: false,
    });
    expect(orgUpdateMany.mock.calls[0][0].data).toEqual({
      payoutMeetingAt: null,
    });
  });

  it('throws for an unknown organization', async () => {
    const { prisma } = fakePrisma({ updatedCount: 0 });
    await expect(
      setPayoutSetupStep(prisma, STAFF, {
        organizationId: 'nope',
        step: 'meeting',
        done: true,
      })
    ).rejects.toThrow(NotFoundError);
  });
});

describe('setPayoutPolicy', () => {
  it('writes the overrides verbatim, null meaning platform default', async () => {
    const { prisma, orgUpdateMany } = fakePrisma();
    await setPayoutPolicy(prisma, STAFF, {
      organizationId: 'org-1',
      releaseAtSale: true,
      holdbackPercent: 10,
      holdbackDays: null,
    });

    expect(orgUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: 'org-1' },
      data: {
        payoutReleaseAtSale: true,
        payoutHoldbackPercent: 10,
        payoutHoldbackDays: null,
      },
    });
  });
});

describe('listPayoutOrganizations', () => {
  const ORG_ROW = {
    id: 'org-1',
    displayName: 'Demo Organizer',
    slug: 'demo-organizer',
    payoutMeetingAt: new Date('2026-08-01T00:00:00Z'),
    payoutBankLinkedAt: null,
    payoutTermsAcceptedAt: null,
    payoutTermsVersion: null,
    stripeAccountId: null,
    stripeAccountKind: null,
    stripeTransfersStatus: null,
    payoutReleaseAtSale: true,
    payoutHoldbackPercent: null,
    payoutHoldbackDays: null,
    owner: { email: 'owner@example.test' },
  };

  it('maps setup state and the effective policy', async () => {
    const { prisma } = fakePrisma({ organizations: [ORG_ROW] });
    const result = await listPayoutOrganizations(prisma, STAFF);
    expect(result).toEqual([
      {
        id: 'org-1',
        displayName: 'Demo Organizer',
        slug: 'demo-organizer',
        ownerEmail: 'owner@example.test',
        payoutMeetingAt: '2026-08-01T00:00:00.000Z',
        payoutBankLinkedAt: null,
        payoutTermsAcceptedAt: null,
        payoutTermsVersion: null,
        stripeAccountId: null,
        stripeAccountKind: null,
        stripeTransfersStatus: null,
        setup: {
          meetingDone: true,
          bankLinked: false,
          termsAccepted: false,
          termsAcceptedAt: null,
          complete: false,
        },
        policy: { holdbackPercent: 20, holdbackDays: 20, releaseAtSale: true },
        holdbackPercentOverride: null,
        holdbackDaysOverride: null,
        hasCustomPolicy: true,
      },
    ]);
  });

  it('includes orgs that requested paid tickets, started Stripe, sell, or have earnings', async () => {
    const { prisma, orgFindMany } = fakePrisma();
    await listPayoutOrganizations(prisma, STAFF);
    expect(orgFindMany.mock.calls[0][0].where).toEqual({
      OR: [
        { paidTicketingRequestedAt: { not: null } },
        { stripeAccountId: { not: null } },
        { paidTicketingEnabled: true },
        {
          events: {
            some: { orders: { some: { status: 'COMPLETED', type: 'PAID' } } },
          },
        },
      ],
    });
  });
});
