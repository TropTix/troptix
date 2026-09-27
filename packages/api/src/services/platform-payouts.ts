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
import { connectStateOf } from './organizer-connect';
import { toRequestDto } from './organizer-payouts';
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
    connectState: connectStateOf(row.organization),
  }));
}

const transferGroupFor = (requestId: string) => `payout-request-${requestId}`;

const RESTRICTED_CODES = new Set([
  'account_invalid',
  'capability_not_active',
  'payouts_not_allowed',
  'transfers_not_allowed',
]);

/**
 * Transfer first, resolve second (ADR 0030 decision 5). The request id is the
 * idempotency key and the transfer group, so a retry after Stripe prunes the
 * key finds the transfer instead of paying twice. Every failure leaves the
 * row REQUESTED; only a resolve that wrote nothing after the money moved is
 * reported for a human to reconcile.
 */
export async function sendPayoutViaStripe(
  prisma: PrismaClient,
  stripe: Stripe,
  actor: Actor,
  input: SendPayoutViaStripeInput,
  now: Date = new Date()
): Promise<{ transferId: string }> {
  const resolvedByUserId = await requirePlatformOwner(prisma, actor);

  const request = await prisma.payoutRequest.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      status: true,
      amountCents: true,
      organization: { select: { id: true, slug: true, stripeAccountId: true } },
    },
  });
  if (!request) throw new NotFoundError('Payout request not found');
  if (request.status !== 'REQUESTED') {
    throw new ConflictError('This request was already resolved or cancelled');
  }
  const destination = request.organization.stripeAccountId;
  if (!destination) {
    throw new ConflictError('This organization has no Stripe account');
  }

  const group = transferGroupFor(request.id);
  const existing = await stripe.transfers.list({
    transfer_group: group,
    limit: 1,
  });
  let transfer = existing.data[0];
  if (!transfer) {
    try {
      transfer = await stripe.transfers.create(
        {
          amount: request.amountCents,
          currency: 'usd',
          destination,
          description: `TropTix payout — ${request.organization.slug} — ${request.id.slice(0, 8)}`,
          transfer_group: group,
          metadata: {
            payoutRequestId: request.id,
            organizationId: request.organization.id,
          },
        },
        { idempotencyKey: group }
      );
    } catch (error) {
      throw await mapTransferError(stripe, error, request.amountCents);
    }
  }

  const updated = await prisma.payoutRequest.updateMany({
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

/** The queue header (plan decision 18): what can be sent against what is owed. */
export async function readPlatformPayoutBalance(
  prisma: PrismaClient,
  stripe: Stripe,
  actor: Actor
): Promise<PlatformPayoutBalance> {
  await requirePlatformOwner(prisma, actor);
  const [availableCents, open] = await Promise.all([
    availableUsdCents(stripe),
    prisma.payoutRequest.aggregate({
      where: { status: 'REQUESTED' },
      _sum: { amountCents: true },
    }),
  ]);
  return { availableCents, openRequestsCents: open._sum.amountCents ?? 0 };
}

/**
 * The safety net under the idempotency rules (plan decision 17): Stripe's
 * transfers carrying a request id, against the rows. Not actor-gated because
 * the cron calls it; the platform page checks its viewer before it does.
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
    if (!requestId) continue;
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
      ],
    },
    select: { id: true, status: true },
  });

  const mismatches: PayoutMismatch[] = [];
  for (const row of rows) {
    const transferIds = transfersByRequest.get(row.id) ?? [];
    if (row.status === 'REQUESTED' && transferIds.length > 0) {
      mismatches.push({
        requestId: row.id,
        kind: 'requested_with_transfer',
        transferIds,
      });
    } else if (row.status === 'PAID' && transferIds.length === 0) {
      mismatches.push({
        requestId: row.id,
        kind: 'paid_without_transfer',
        transferIds,
      });
    } else if (row.status === 'PAID' && transferIds.length > 1) {
      mismatches.push({
        requestId: row.id,
        kind: 'duplicate_transfer',
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

/** The setup panel's list: every Organization that sells (or has sold) paid tickets. */
export async function listPayoutOrganizations(
  prisma: PrismaClient,
  actor: Actor
): Promise<PayoutOrganization[]> {
  await requirePlatformOwner(prisma, actor);

  const rows = await prisma.organization.findMany({
    where: {
      OR: [
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
      stripeAccountId: true,
      stripeTransfersStatus: true,
      payoutReleaseAtSale: true,
      payoutHoldbackPercent: true,
      payoutHoldbackDays: true,
      owner: { select: { email: true } },
    },
  });

  return rows.map((org) => {
    const meetingDone = org.payoutMeetingAt !== null;
    const bankLinked = org.payoutBankLinkedAt !== null;
    return {
      id: org.id,
      displayName: org.displayName,
      slug: org.slug,
      ownerEmail: org.owner.email,
      payoutMeetingAt: org.payoutMeetingAt?.toISOString() ?? null,
      payoutBankLinkedAt: org.payoutBankLinkedAt?.toISOString() ?? null,
      stripeAccountId: org.stripeAccountId,
      stripeTransfersStatus: org.stripeTransfersStatus,
      setup: { meetingDone, bankLinked, complete: meetingDone && bankLinked },
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
