import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  listPayoutOrganizations,
  listPayoutRequests,
  resolvePayoutRequest,
  setPayoutPolicy,
  setPayoutSetupStep,
} from './platform-payouts';
import {
  ConflictError,
  NotFoundError,
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
    owner: { email: 'owner@example.test' },
  },
};

interface FakeOpts {
  platformOwner?: boolean;
  requests?: unknown[];
  organizations?: unknown[];
  updatedCount?: number;
}

function fakePrisma(opts: FakeOpts = {}) {
  const requestUpdateMany = vi
    .fn()
    .mockResolvedValue({ count: opts.updatedCount ?? 1 });
  const orgUpdateMany = vi
    .fn()
    .mockResolvedValue({ count: opts.updatedCount ?? 1 });
  const requestFindMany = vi.fn().mockResolvedValue(opts.requests ?? []);
  const orgFindMany = vi.fn().mockResolvedValue(opts.organizations ?? []);

  const prisma = {
    users: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ isPlatformOwner: opts.platformOwner ?? true }),
    },
    payoutRequest: {
      findMany: requestFindMany,
      updateMany: requestUpdateMany,
    },
    organization: { findMany: orgFindMany, updateMany: orgUpdateMany },
  } as unknown as PrismaClient;

  return { prisma, requestUpdateMany, orgUpdateMany, orgFindMany };
}

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
      },
    ]);
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
        setup: { meetingDone: true, bankLinked: false, complete: false },
        policy: { holdbackPercent: 20, holdbackDays: 20, releaseAtSale: true },
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
