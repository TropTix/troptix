import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import type { Actor } from '../trpc/context';
import type {
  PayoutMismatch,
  PayoutOrganization,
  PlatformPayoutBalance,
  PlatformPayoutRequest,
  ResolvePayoutRequestInput,
  SendPayoutViaStripeInput,
  SetPayoutPolicyInput,
  SetPayoutSetupStepInput,
} from '../contracts/payouts';
import {
  ConflictError,
  InsufficientPlatformBalanceError,
  NotFoundError,
  StripeAccountRestrictedError,
} from './_shared/errors';
import { resolvePayoutPolicy } from './_shared/payouts';
import {
  connectStateOf,
  isGlobalPayouts,
  toAccountKind,
} from './organizer-connect';
import { toRequestDto, toSetupState } from './organizer-payouts';
import { requirePlatformOwner } from './organizer-scope';

export async function listPayoutRequests(
  prisma: PrismaClient,
  actor: Actor
): Promise<PlatformPayoutRequest[]> {
  await requirePlatformOwner(prisma, actor);

  const rows = await prisma.payoutRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      organization: {
        select: {
          displayName: true,
          slug: true,
          stripeAccountId: true,
          stripeAccountKind: true,
          stripeTransfersStatus: true,
          payoutBankLinkedAt: true,
          owner: { select: { email: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    ...toRequestDto(row),
    organizationId: row.organizationId,
    organizationName: row.organization.displayName,
    organizationSlug: row.organization.slug,
    ownerEmail: row.organization.owner.email,
    stripeAccountId: row.organization.stripeAccountId,
    stripeAccountKind: toAccountKind(row.organization.stripeAccountKind),
    connectState: connectStateOf(row.organization),
  }));
}

const transferGroupFor = (requestId: string) => `payout-request-${requestId}`;

const RESTRICTED_CODES = new Set([
  'account_invalid',
  'insufficient_capabilities_for_transfer',
  'payouts_not_allowed',
  'transfers_not_allowed',
]);

/**
 * Transfer first, resolve second (ADR 0030 decision 5, keys per ADR 0033).
 * The row lock serializes two admins on one request; the transfer-group
 * lookup catches a transfer whose response never arrived. Every failure
 * leaves the row REQUESTED; only a resolve that wrote nothing after the money
 * moved is reported for a human to reconcile.
 */
export async function sendPayoutViaStripe(
  prisma: PrismaClient,
  stripe: Stripe,
  actor: Actor,
  input: SendPayoutViaStripeInput,
  now: Date = new Date()
): Promise<{ transferId: string }> {
  const resolvedByUserId = await requirePlatformOwner(prisma, actor);

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PayoutRequest" WHERE id = ${input.id} FOR UPDATE`;
      const request = await tx.payoutRequest.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          status: true,
          amountCents: true,
          organization: {
            select: {
              id: true,
              slug: true,
              stripeAccountId: true,
              stripeAccountKind: true,
              stripeTransfersStatus: true,
              payoutBankLinkedAt: true,
            },
          },
        },
      });
      if (!request) throw new NotFoundError('Payout request not found');
      if (request.status !== 'REQUESTED') {
        throw new ConflictError(
          'This request was already resolved or cancelled'
        );
      }
      const { organization } = request;
      if (
        !organization.stripeAccountId ||
        connectStateOf(organization) !== 'active'
      ) {
        throw new ConflictError(
          'This organization is not active on Stripe; pay another way'
        );
      }
      if (isGlobalPayouts(organization.stripeAccountKind)) {
        throw new ConflictError(
          'Global Payouts sends are not built yet; pay another way'
        );
      }

      const transfer = await findOrCreateTransfer(stripe, {
        id: request.id,
        amountCents: request.amountCents,
        destination: organization.stripeAccountId,
        organizationId: organization.id,
        slug: organization.slug,
      });

      const updated = await tx.payoutRequest.updateMany({
        where: { id: request.id, status: 'REQUESTED' },
        data: {
          status: 'PAID',
          rail: 'STRIPE',
          reference: transfer.id,
          resolvedAt: now,
          resolvedByUserId,
        },
      });
      if (updated.count === 0) {
        throw new ConflictError(
          `Transfer ${transfer.id} was sent but the request was already resolved or cancelled — reconcile by hand`
        );
      }
      return { transferId: transfer.id };
    },
    { timeout: 30_000 }
  );
}

/**
 * Stripe replays a cached failure under a reused idempotency key for 24
 * hours, so the key is per attempt; the group lookup is what finds a transfer
 * whose response was lost. A reversed transfer paid nobody and is not reused.
 */
async function findOrCreateTransfer(
  stripe: Stripe,
  request: {
    id: string;
    amountCents: number;
    destination: string;
    organizationId: string;
    slug: string;
  }
): Promise<Stripe.Transfer> {
  const group = transferGroupFor(request.id);
  const existing = await stripe.transfers.list({
    transfer_group: group,
    limit: 10,
  });
  const live = existing.data.find((transfer) => !transfer.reversed);
  if (live) return live;

  try {
    return await stripe.transfers.create(
      {
        amount: request.amountCents,
        currency: 'usd',
        destination: request.destination,
        description: `TropTix payout — ${request.slug} — ${request.id.slice(0, 8)}`,
        transfer_group: group,
        metadata: {
          payoutRequestId: request.id,
          organizationId: request.organizationId,
        },
      },
      { idempotencyKey: `${group}-${randomUUID()}` }
    );
  } catch (error) {
    throw await mapTransferError(stripe, error, request.amountCents);
  }
}

async function mapTransferError(
  stripe: Stripe,
  error: unknown,
  amountCents: number
): Promise<unknown> {
  const code = (error as { code?: string }).code;
  if (code === 'balance_insufficient') {
    let shortfallCents: number | null = null;
    try {
      shortfallCents = Math.max(
        amountCents - (await availableUsdCents(stripe)),
        0
      );
    } catch {
      shortfallCents = null;
    }
    return new InsufficientPlatformBalanceError(shortfallCents);
  }
  if (code && RESTRICTED_CODES.has(code)) {
    return new StripeAccountRestrictedError();
  }
  return error;
}

async function availableUsdCents(stripe: Stripe): Promise<number> {
  const balance = await stripe.balance.retrieve();
  return balance.available
    .filter((entry) => entry.currency === 'usd')
    .reduce((sum, entry) => sum + entry.amount, 0);
}

/**
 * The queue header (plan decision 18): what Stripe can send against what the
 * Stripe rail owes. Manual-rail requests never draw on this balance.
 */
export async function readPlatformPayoutBalance(
  prisma: PrismaClient,
  stripe: Stripe,
  actor: Actor
): Promise<PlatformPayoutBalance> {
  await requirePlatformOwner(prisma, actor);
  const [availableCents, open] = await Promise.all([
    availableUsdCents(stripe),
    prisma.payoutRequest.aggregate({
      where: {
        status: 'REQUESTED',
        organization: {
          stripeAccountId: { not: null },
          stripeTransfersStatus: 'active',
        },
      },
      _sum: { amountCents: true },
    }),
  ]);
  return { availableCents, openRequestsCents: open._sum.amountCents ?? 0 };
}

/**
 * The safety net under the idempotency rules (plan decision 17): Stripe's
 * live transfers carrying a request id, against the rows. Not actor-gated
 * because the cron calls it; the platform page checks its viewer first.
 */
export async function reconcileStripePayouts(
  prisma: PrismaClient,
  stripe: Stripe,
  {
    now = new Date(),
    windowDays = 35,
  }: { now?: Date; windowDays?: number } = {}
): Promise<PayoutMismatch[]> {
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  const transfersByRequest = new Map<string, string[]>();
  for await (const transfer of stripe.transfers.list({
    created: { gte: Math.floor(since.getTime() / 1000) },
    limit: 100,
  })) {
    const requestId = transfer.metadata?.payoutRequestId;
    if (!requestId || transfer.reversed) continue;
    transfersByRequest.set(requestId, [
      ...(transfersByRequest.get(requestId) ?? []),
      transfer.id,
    ]);
  }

  const rows = await prisma.payoutRequest.findMany({
    where: {
      OR: [
        { status: 'REQUESTED' },
        { status: 'PAID', rail: 'STRIPE', resolvedAt: { gte: since } },
        { id: { in: Array.from(transfersByRequest.keys()) } },
      ],
    },
    select: { id: true, status: true, rail: true },
  });

  const mismatches: PayoutMismatch[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(row.id);
    const transferIds = transfersByRequest.get(row.id) ?? [];
    const paidOnStripe = row.status === 'PAID' && row.rail === 'STRIPE';
    if (row.status === 'REQUESTED' && transferIds.length > 0) {
      mismatches.push({
        requestId: row.id,
        kind: 'requested_with_transfer',
        transferIds,
      });
    } else if (paidOnStripe && transferIds.length === 0) {
      mismatches.push({
        requestId: row.id,
        kind: 'paid_without_transfer',
        transferIds,
      });
    } else if (paidOnStripe && transferIds.length > 1) {
      mismatches.push({
        requestId: row.id,
        kind: 'duplicate_transfer',
        transferIds,
      });
    } else if (
      !paidOnStripe &&
      row.status !== 'REQUESTED' &&
      transferIds.length > 0
    ) {
      mismatches.push({
        requestId: row.id,
        kind: 'closed_with_transfer',
        transferIds,
      });
    }
  }
  for (const [requestId, transferIds] of Array.from(transfersByRequest)) {
    if (!seen.has(requestId)) {
      mismatches.push({
        requestId,
        kind: 'transfer_without_request',
        transferIds,
      });
    }
  }
  return mismatches;
}

/**
 * Guarded on `status: REQUESTED` so a double click, or an organizer cancel
 * racing the admin, resolves exactly once.
 */
export async function resolvePayoutRequest(
  prisma: PrismaClient,
  actor: Actor,
  input: ResolvePayoutRequestInput
): Promise<void> {
  const resolvedByUserId = await requirePlatformOwner(prisma, actor);

  if (input.outcome === 'REJECTED' && !input.adminNote?.trim()) {
    throw new ConflictError('A rejection needs a note for the organizer');
  }

  const updated = await prisma.payoutRequest.updateMany({
    where: { id: input.id, status: 'REQUESTED' },
    data: {
      status: input.outcome,
      resolvedAt: new Date(),
      resolvedByUserId,
      adminNote: input.adminNote?.trim() || null,
      ...(input.outcome === 'PAID'
        ? {
            rail: input.rail ?? 'MERCURY',
            reference: input.reference?.trim() || null,
          }
        : {}),
    },
  });

  if (updated.count === 0) {
    throw new ConflictError('This request was already resolved or cancelled');
  }
}

export async function setPayoutSetupStep(
  prisma: PrismaClient,
  actor: Actor,
  input: SetPayoutSetupStepInput
): Promise<void> {
  await requirePlatformOwner(prisma, actor);

  const column =
    input.step === 'meeting' ? 'payoutMeetingAt' : 'payoutBankLinkedAt';
  const updated = await prisma.organization.updateMany({
    where: { id: input.organizationId },
    data: { [column]: input.done ? new Date() : null },
  });

  if (updated.count === 0) {
    throw new NotFoundError('Organization not found');
  }
}

/** Custom payout timelines (graduated trust). Null resets to the platform default. */
export async function setPayoutPolicy(
  prisma: PrismaClient,
  actor: Actor,
  input: SetPayoutPolicyInput
): Promise<void> {
  await requirePlatformOwner(prisma, actor);

  const updated = await prisma.organization.updateMany({
    where: { id: input.organizationId },
    data: {
      payoutReleaseAtSale: input.releaseAtSale,
      payoutHoldbackPercent: input.holdbackPercent,
      payoutHoldbackDays: input.holdbackDays,
    },
  });

  if (updated.count === 0) {
    throw new NotFoundError('Organization not found');
  }
}

/**
 * The setup panel's list: every Organization on the road to payouts — one
 * that asked to sell paid tickets, started Stripe onboarding, is approved,
 * or has sold.
 */
export async function listPayoutOrganizations(
  prisma: PrismaClient,
  actor: Actor
): Promise<PayoutOrganization[]> {
  await requirePlatformOwner(prisma, actor);

  const rows = await prisma.organization.findMany({
    where: {
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
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      displayName: true,
      slug: true,
      payoutMeetingAt: true,
      payoutBankLinkedAt: true,
      payoutTermsAcceptedAt: true,
      payoutTermsVersion: true,
      stripeAccountId: true,
      stripeAccountKind: true,
      stripeTransfersStatus: true,
      payoutReleaseAtSale: true,
      payoutHoldbackPercent: true,
      payoutHoldbackDays: true,
      owner: { select: { email: true } },
    },
  });

  return rows.map((org) => {
    return {
      id: org.id,
      displayName: org.displayName,
      slug: org.slug,
      ownerEmail: org.owner.email,
      payoutMeetingAt: org.payoutMeetingAt?.toISOString() ?? null,
      payoutBankLinkedAt: org.payoutBankLinkedAt?.toISOString() ?? null,
      payoutTermsAcceptedAt: org.payoutTermsAcceptedAt?.toISOString() ?? null,
      payoutTermsVersion: org.payoutTermsVersion,
      stripeAccountId: org.stripeAccountId,
      stripeAccountKind: toAccountKind(org.stripeAccountKind),
      stripeTransfersStatus: org.stripeTransfersStatus,
      setup: toSetupState(org),
      policy: resolvePayoutPolicy(org),
      holdbackPercentOverride: org.payoutHoldbackPercent,
      holdbackDaysOverride: org.payoutHoldbackDays,
      hasCustomPolicy:
        org.payoutReleaseAtSale ||
        org.payoutHoldbackPercent !== null ||
        org.payoutHoldbackDays !== null,
    };
  });
}
