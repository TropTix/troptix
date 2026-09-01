import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  cancelPayoutRequest,
  getPayouts,
  requestPayout,
} from './organizer-payouts';
import {
  InvalidPayoutAmountError,
  NotFoundError,
  PayoutRequestPendingError,
  PayoutSetupIncompleteError,
  UnauthorizedError,
} from './_shared/errors';

const NOW = new Date('2026-09-01T12:00:00Z');
const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };

const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const SETUP_DONE = {
  payoutMeetingAt: new Date('2026-08-01T00:00:00Z'),
  payoutBankLinkedAt: new Date('2026-08-02T00:00:00Z'),
};

const DEFAULT_ORG = {
  id: 'org-1',
  payoutMeetingAt: null,
  payoutBankLinkedAt: null,
  payoutReleaseAtSale: false,
  payoutHoldbackPercent: null,
  payoutHoldbackDays: null,
};

interface FakeOpts {
  platformOwner?: boolean;
  org?: Record<string, unknown> | null;
  earnedRows?: { eventId: string; endsAt: Date; subtotalCents: bigint }[];
  absorbedGroups?: {
    eventId: string;
    subtotal: number | null;
    quantity: bigint;
  }[];
  requestSums?: { status: string; _sum: { amountCents: number | null } }[];
  requests?: unknown[];
  openCount?: number;
}

function fakePrisma(opts: FakeOpts = {}) {
  const orgFindFirst = vi
    .fn()
    .mockResolvedValue(opts.org === undefined ? DEFAULT_ORG : opts.org);
  const queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    if (strings.join('').includes('FROM "Orders"')) {
      return opts.earnedRows ?? [];
    }
    return opts.absorbedGroups ?? [];
  });
  const groupBy = vi.fn().mockResolvedValue(opts.requestSums ?? []);
  const findMany = vi.fn().mockResolvedValue(opts.requests ?? []);
  const count = vi.fn().mockResolvedValue(opts.openCount ?? 0);
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'req-new',
    createdAt: NOW,
    status: 'REQUESTED',
    note: null,
    resolvedAt: null,
    rail: null,
    reference: null,
    adminNote: null,
    ...data,
  }));
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });

  const prisma = {
    users: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ isPlatformOwner: opts.platformOwner ?? false }),
    },
    organization: { findFirst: orgFindFirst },
    payoutRequest: { groupBy, findMany, count, create, updateMany },
    $queryRaw: queryRaw,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma)
    ),
  } as unknown as PrismaClient;

  return { prisma, orgFindFirst, queryRaw, create, count, updateMany };
}

describe('getPayouts — authorization and scoping', () => {
  it('rejects an anonymous actor', async () => {
    const { prisma } = fakePrisma();
    await expect(getPayouts(prisma, { kind: 'anonymous' })).rejects.toThrow(
      UnauthorizedError
    );
  });

  it('resolves the org by the acting owner', async () => {
    const { prisma, orgFindFirst } = fakePrisma();
    await getPayouts(prisma, OWNER, {}, NOW);
    expect(orgFindFirst.mock.calls[0][0].where).toEqual({
      ownerUserId: 'owner-1',
    });
  });

  it('honors View-as for a platform owner', async () => {
    const { prisma, orgFindFirst } = fakePrisma({ platformOwner: true });
    await getPayouts(
      prisma,
      OWNER,
      { viewAsOrganizerUserId: 'target-organizer' },
      NOW
    );
    expect(orgFindFirst.mock.calls[0][0].where).toEqual({
      ownerUserId: 'target-organizer',
    });
  });

  it('returns zeroed balances when the user has no organization', async () => {
    const { prisma } = fakePrisma({ org: null });
    const result = await getPayouts(prisma, OWNER, {}, NOW);
    expect(result).toMatchObject({
      availableCents: 0,
      pendingCents: 0,
      paidOutCents: 0,
      setup: { complete: false },
      requests: [],
    });
  });
});

describe('getPayouts — earnings math', () => {
  it('splits earnings by the release rule per event', async () => {
    const { prisma } = fakePrisma({
      earnedRows: [
        // Ended 30 days ago: fully released.
        { eventId: 'e-old', endsAt: daysAgo(30), subtotalCents: 10000n },
        // Ended 5 days ago: 20% still held.
        { eventId: 'e-recent', endsAt: daysAgo(5), subtotalCents: 10000n },
        // Not ended: all pending.
        { eventId: 'e-live', endsAt: daysAgo(-10), subtotalCents: 5000n },
      ],
    });

    const result = await getPayouts(prisma, OWNER, {}, NOW);
    expect(result.availableCents).toBe(10000 + 8000);
    expect(result.pendingCents).toBe(2000 + 5000);
  });

  it('subtracts derived absorbed fees from an event’s earnings', async () => {
    const { prisma } = fakePrisma({
      earnedRows: [
        { eventId: 'e-old', endsAt: daysAgo(30), subtotalCents: 10000n },
      ],
      // Two $25.00 tickets on an absorb tier: 2 × (8% × 2500 + 50) = 500.
      absorbedGroups: [{ eventId: 'e-old', subtotal: 25, quantity: 2n }],
    });

    const result = await getPayouts(prisma, OWNER, {}, NOW);
    expect(result.availableCents).toBe(9500);
  });

  it('subtracts open and paid requests from available, not pending', async () => {
    const { prisma } = fakePrisma({
      earnedRows: [
        { eventId: 'e-old', endsAt: daysAgo(30), subtotalCents: 10000n },
      ],
      requestSums: [
        { status: 'REQUESTED', _sum: { amountCents: 1000 } },
        { status: 'PAID', _sum: { amountCents: 3000 } },
        { status: 'CANCELLED', _sum: { amountCents: 9999 } },
        { status: 'REJECTED', _sum: { amountCents: 9999 } },
      ],
    });

    const result = await getPayouts(prisma, OWNER, {}, NOW);
    expect(result.availableCents).toBe(6000);
    expect(result.paidOutCents).toBe(3000);
  });

  it('releases a live event’s earnings under releaseAtSale', async () => {
    const { prisma } = fakePrisma({
      org: { ...DEFAULT_ORG, payoutReleaseAtSale: true },
      earnedRows: [
        { eventId: 'e-live', endsAt: daysAgo(-10), subtotalCents: 10000n },
      ],
    });

    const result = await getPayouts(prisma, OWNER, {}, NOW);
    expect(result.availableCents).toBe(8000);
    expect(result.pendingCents).toBe(2000);
    expect(result.policy.releaseAtSale).toBe(true);
  });

  it('applies custom holdback overrides', async () => {
    const { prisma } = fakePrisma({
      org: {
        ...DEFAULT_ORG,
        payoutHoldbackPercent: 10,
        payoutHoldbackDays: 3,
      },
      earnedRows: [
        { eventId: 'e-a', endsAt: daysAgo(5), subtotalCents: 10000n },
        { eventId: 'e-b', endsAt: daysAgo(1), subtotalCents: 10000n },
      ],
    });

    const result = await getPayouts(prisma, OWNER, {}, NOW);
    // e-a is past the 3-day window; e-b holds 10%.
    expect(result.availableCents).toBe(10000 + 9000);
    expect(result.pendingCents).toBe(1000);
    expect(result.policy).toEqual({
      holdbackPercent: 10,
      holdbackDays: 3,
      releaseAtSale: false,
    });
  });
});

describe('requestPayout', () => {
  const readyOrg = { ...DEFAULT_ORG, ...SETUP_DONE };
  const withReleased = {
    org: readyOrg,
    earnedRows: [
      { eventId: 'e-old', endsAt: daysAgo(30), subtotalCents: 10000n },
    ],
  };

  it('rejects an anonymous actor', async () => {
    const { prisma } = fakePrisma();
    await expect(
      requestPayout(prisma, { kind: 'anonymous' }, { amountCents: 100 })
    ).rejects.toThrow(UnauthorizedError);
  });

  it('rejects until payout setup is complete', async () => {
    const { prisma } = fakePrisma({
      org: { ...DEFAULT_ORG, payoutMeetingAt: new Date() },
    });
    await expect(
      requestPayout(prisma, OWNER, { amountCents: 100 }, NOW)
    ).rejects.toThrow(PayoutSetupIncompleteError);
  });

  it('rejects while another request is open', async () => {
    const { prisma } = fakePrisma({ ...withReleased, openCount: 1 });
    await expect(
      requestPayout(prisma, OWNER, { amountCents: 100 }, NOW)
    ).rejects.toThrow(PayoutRequestPendingError);
  });

  it('rejects an amount above the available balance', async () => {
    const { prisma } = fakePrisma(withReleased);
    await expect(
      requestPayout(prisma, OWNER, { amountCents: 10001 }, NOW)
    ).rejects.toThrow(InvalidPayoutAmountError);
  });

  it('creates the request with the org, actor, and amount', async () => {
    const { prisma, create } = fakePrisma(withReleased);
    const result = await requestPayout(
      prisma,
      OWNER,
      { amountCents: 10000, note: '  wire as usual  ' },
      NOW
    );

    expect(create.mock.calls[0][0].data).toMatchObject({
      organizationId: 'org-1',
      requestedByUserId: 'owner-1',
      amountCents: 10000,
      note: 'wire as usual',
    });
    expect(result.status).toBe('REQUESTED');
  });

  it('recomputes availability inside a Serializable transaction', async () => {
    const { prisma } = fakePrisma(withReleased);
    await requestPayout(prisma, OWNER, { amountCents: 100 }, NOW);
    expect(
      (prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][1]
    ).toEqual({ isolationLevel: 'Serializable' });
  });
});

describe('cancelPayoutRequest', () => {
  it('only touches the actor’s own open request', async () => {
    const { prisma, updateMany } = fakePrisma();
    await cancelPayoutRequest(prisma, OWNER, { id: 'req-1' });

    expect(updateMany.mock.calls[0][0]).toEqual({
      where: {
        id: 'req-1',
        status: 'REQUESTED',
        organization: { ownerUserId: 'owner-1' },
      },
      data: { status: 'CANCELLED' },
    });
  });

  it('throws when there is nothing to cancel', async () => {
    const { prisma, updateMany } = fakePrisma();
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      cancelPayoutRequest(prisma, OWNER, { id: 'req-1' })
    ).rejects.toThrow(NotFoundError);
  });
});
