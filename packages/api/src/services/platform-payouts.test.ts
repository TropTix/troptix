import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
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
  } as unknown as PrismaClient;

  return { prisma, requestUpdateMany, orgUpdateMany, orgFindMany };
}

interface FakeTransfer {
  id: string;
  metadata?: Record<string, string>;
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

function fakeStripe(
  opts: {
    existing?: FakeTransfer[];
    all?: FakeTransfer[];
    createError?: unknown;
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
  const stripe = {
    transfers: { create, list },
    balance: { retrieve },
  } as unknown as Stripe;
  return { stripe, create, list, retrieve };
}

const OPEN_REQUEST = {
  id: 'req-1',
  status: 'REQUESTED',
  amountCents: 25000,
  organization: {
    id: 'org-1',
    slug: 'island-nights',
    stripeAccountId: 'acct_1',
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
        connectState: 'manual',
      },
    ]);
  });

  it('derives the Connect state from the organization row', async () => {
    const row = {
      ...REQUEST_ROW,
      organization: {
        ...REQUEST_ROW.organization,
        stripeAccountId: 'acct_1',
        stripeTransfersStatus: 'active',
        payoutBankLinkedAt: new Date('2026-09-01T00:00:00Z'),
      },
    };
    const { prisma } = fakePrisma({ requests: [row] });
    const [result] = await listPayoutRequests(prisma, STAFF);
    expect(result.stripeAccountId).toBe('acct_1');
    expect(result.connectState).toBe('active');
  });
});

describe('sendPayoutViaStripe', () => {
  const NOW = new Date('2026-09-27T12:00:00Z');

  it('creates the transfer with the request id as key and group, then resolves the row', async () => {
    const { prisma, requestUpdateMany } = fakePrisma({ request: OPEN_REQUEST });
    const { stripe, create, list } = fakeStripe();

    const result = await sendPayoutViaStripe(
      prisma,
      stripe,
      STAFF,
      { id: 'req-1' },
      NOW
    );

    expect(result).toEqual({ transferId: 'tr_new' });
    expect(list).toHaveBeenCalledWith({
      transfer_group: 'payout-request-req-1',
      limit: 1,
    });
    expect(create).toHaveBeenCalledWith(
      {
        amount: 25000,
        currency: 'usd',
        destination: 'acct_1',
        description: 'TropTix payout — island-nights — req-1',
        transfer_group: 'payout-request-req-1',
        metadata: { payoutRequestId: 'req-1', organizationId: 'org-1' },
      },
      { idempotencyKey: 'payout-request-req-1' }
    );
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

  it('reuses a transfer already in the group instead of creating a second one', async () => {
    const { prisma, requestUpdateMany } = fakePrisma({ request: OPEN_REQUEST });
    const { stripe, create } = fakeStripe({ existing: [{ id: 'tr_old' }] });

    const result = await sendPayoutViaStripe(prisma, stripe, STAFF, {
      id: 'req-1',
    });

    expect(result.transferId).toBe('tr_old');
    expect(create).not.toHaveBeenCalled();
    expect(requestUpdateMany.mock.calls[0][0].data.reference).toBe('tr_old');
  });

  it('maps balance_insufficient to the typed error with the shortfall and leaves the row alone', async () => {
    const { prisma, requestUpdateMany } = fakePrisma({ request: OPEN_REQUEST });
    const { stripe } = fakeStripe({
      createError: stripeError('balance_insufficient'),
      availableUsd: 10000,
    });

    const error = await sendPayoutViaStripe(prisma, stripe, STAFF, {
      id: 'req-1',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InsufficientPlatformBalanceError);
    expect((error as InsufficientPlatformBalanceError).shortfallCents).toBe(
      15000
    );
    expect(requestUpdateMany).not.toHaveBeenCalled();
  });

  it('maps a restricted account to the typed error', async () => {
    const { prisma } = fakePrisma({ request: OPEN_REQUEST });
    const { stripe } = fakeStripe({
      createError: stripeError('transfers_not_allowed'),
    });
    await expect(
      sendPayoutViaStripe(prisma, stripe, STAFF, { id: 'req-1' })
    ).rejects.toThrow(StripeAccountRestrictedError);
  });

  it('rethrows any other Stripe failure untouched', async () => {
    const { prisma } = fakePrisma({ request: OPEN_REQUEST });
    const boom = stripeError('api_connection_error');
    const { stripe } = fakeStripe({ createError: boom });
    await expect(
      sendPayoutViaStripe(prisma, stripe, STAFF, { id: 'req-1' })
    ).rejects.toBe(boom);
  });

  it('reports the transfer id when the resolve wrote no rows', async () => {
    const { prisma } = fakePrisma({ request: OPEN_REQUEST, updatedCount: 0 });
    const { stripe } = fakeStripe();
    await expect(
      sendPayoutViaStripe(prisma, stripe, STAFF, { id: 'req-1' })
    ).rejects.toThrow(/tr_new/);
  });

  it('refuses a request that is not open, an organization without an account, and a non-owner', async () => {
    const { stripe, create } = fakeStripe();

    const resolved = fakePrisma({
      request: { ...OPEN_REQUEST, status: 'PAID' },
    });
    await expect(
      sendPayoutViaStripe(resolved.prisma, stripe, STAFF, { id: 'req-1' })
    ).rejects.toThrow(ConflictError);

    const manual = fakePrisma({
      request: {
        ...OPEN_REQUEST,
        organization: { ...OPEN_REQUEST.organization, stripeAccountId: null },
      },
    });
    await expect(
      sendPayoutViaStripe(manual.prisma, stripe, STAFF, { id: 'req-1' })
    ).rejects.toThrow(ConflictError);

    const missing = fakePrisma();
    await expect(
      sendPayoutViaStripe(missing.prisma, stripe, STAFF, { id: 'req-1' })
    ).rejects.toThrow(NotFoundError);

    const owner = fakePrisma({ platformOwner: false, request: OPEN_REQUEST });
    await expect(
      sendPayoutViaStripe(owner.prisma, stripe, OWNER, { id: 'req-1' })
    ).rejects.toThrow(UnauthorizedError);

    expect(create).not.toHaveBeenCalled();
  });
});

describe('readPlatformPayoutBalance', () => {
  it('sums the USD available balance against open requests', async () => {
    const { prisma } = fakePrisma({ openSumCents: 30000 });
    const { stripe } = fakeStripe({ availableUsd: 12345 });
    await expect(
      readPlatformPayoutBalance(prisma, stripe, STAFF)
    ).resolves.toEqual({ availableCents: 12345, openRequestsCents: 30000 });
  });

  it('reads zero open requests as zero', async () => {
    const { prisma } = fakePrisma();
    const { stripe } = fakeStripe();
    const result = await readPlatformPayoutBalance(prisma, stripe, STAFF);
    expect(result.openRequestsCents).toBe(0);
  });
});

describe('reconcileStripePayouts', () => {
  const NOW = new Date('2026-09-27T12:00:00Z');
  const rows = [
    { id: 'open-clean', status: 'REQUESTED' },
    { id: 'open-sent', status: 'REQUESTED' },
    { id: 'paid-clean', status: 'PAID' },
    { id: 'paid-missing', status: 'PAID' },
    { id: 'paid-twice', status: 'PAID' },
  ];
  const transfers: FakeTransfer[] = [
    { id: 'tr_a', metadata: { payoutRequestId: 'open-sent' } },
    { id: 'tr_b', metadata: { payoutRequestId: 'paid-clean' } },
    { id: 'tr_c', metadata: { payoutRequestId: 'paid-twice' } },
    { id: 'tr_d', metadata: { payoutRequestId: 'paid-twice' } },
    { id: 'tr_e', metadata: {} },
  ];

  it('flags the three mismatch kinds and nothing else', async () => {
    const { prisma } = fakePrisma({ requests: rows });
    const { stripe, list } = fakeStripe({ all: transfers });

    const result = await reconcileStripePayouts(prisma, stripe, {
      now: NOW,
      windowDays: 35,
    });

    expect(result).toEqual([
      {
        requestId: 'open-sent',
        kind: 'requested_with_transfer',
        transferIds: ['tr_a'],
      },
      {
        requestId: 'paid-missing',
        kind: 'paid_without_transfer',
        transferIds: [],
      },
      {
        requestId: 'paid-twice',
        kind: 'duplicate_transfer',
        transferIds: ['tr_c', 'tr_d'],
      },
    ]);
    expect(list).toHaveBeenCalledWith({
      created: { gte: Math.floor((NOW.getTime() - 35 * 86_400_000) / 1000) },
      limit: 100,
    });
  });

  it('returns nothing when rows and transfers agree', async () => {
    const { prisma } = fakePrisma({
      requests: [{ id: 'paid-clean', status: 'PAID' }],
    });
    const { stripe } = fakeStripe({ all: transfers });
    await expect(
      reconcileStripePayouts(prisma, stripe, { now: NOW })
    ).resolves.toEqual([]);
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
    stripeAccountId: null,
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
        stripeAccountId: null,
        setup: { meetingDone: true, bankLinked: false, complete: false },
        policy: { holdbackPercent: 20, holdbackDays: 20, releaseAtSale: true },
        holdbackPercentOverride: null,
        holdbackDaysOverride: null,
        hasCustomPolicy: true,
      },
    ]);
  });

  it('includes orgs that sell paid tickets or already have earnings', async () => {
    const { prisma, orgFindMany } = fakePrisma();
    await listPayoutOrganizations(prisma, STAFF);
    expect(orgFindMany.mock.calls[0][0].where).toEqual({
      OR: [
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
