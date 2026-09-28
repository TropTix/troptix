import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import type StripePreview from 'stripe-preview';
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
import {
  globalPayoutFeeHeadroomCents,
  resolvePayoutPolicy,
} from './_shared/payouts';
import {
  connectStateOf,
  isGlobalPayouts,
  toAccountKind,
  type PayoutClients,
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
/**
 * v2 replays a request that succeeded, so once a payment has come back the
 * key must change or the resend would be handed the dead payment (ADR 0034).
 */
const globalPayoutKeyFor = (requestId: string, deadCount: number) =>
  `global-payout-${requestId}-${deadCount}`;

const RESTRICTED_CODES = new Set([
  'account_invalid',
  'insufficient_capabilities_for_transfer',
  'payouts_not_allowed',
  'transfers_not_allowed',
]);

/**
 * OutboundPayment create codes that mean the recipient's bank details, not
 * the money, are the problem; the organizer fixes them through Stripe.
 * From the create endpoint's error table (2026-09-27).
 */
const RECIPIENT_NOT_READY_CODES = new Set([
  'account_not_configured_as_recipient',
  'outbound_payment_not_allowed',
  'payout_method_archived',
  'payout_method_disabled',
  'payout_method_expired',
  'payout_method_invalid',
  'payout_method_unsupported_currency',
  'payout_method_unusable',
  'recipient_feature_not_active',
  'recipient_feature_not_active_for_suitable_delivery_option',
  'to_recipient_not_found',
]);

/** Stripe-side velocity limits on the recipient: nothing for the organizer to fix. */
const RECIPIENT_LIMIT_CODES = new Set([
  'recipient_amount_limit_exceeded',
  'recipient_count_limit_exceeded',
]);

/** A payment in one of these states paid nobody; it is neither reused nor counted live. */
const DEAD_PAYMENT_STATUSES = new Set(['failed', 'canceled', 'returned']);

/**
 * Money first, resolve second (ADR 0030 decision 5, keys per ADR 0033 for
 * transfers and ADR 0034 for outbound payments). The row lock serializes two
 * admins on one request; the lookup before the create catches money whose
 * response never arrived. Every failure leaves the row REQUESTED; only a
 * resolve that wrote nothing after the money moved is reported for a human
 * to reconcile.
 */
export async function sendPayoutViaStripe(
  prisma: PrismaClient,
  clients: PayoutClients,
  actor: Actor,
  input: SendPayoutViaStripeInput,
  now: Date = new Date()
): Promise<{ reference: string }> {
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
          createdAt: true,
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

      const send = {
        id: request.id,
        amountCents: request.amountCents,
        createdAt: request.createdAt,
        destination: organization.stripeAccountId,
        organizationId: organization.id,
        slug: organization.slug,
      };
      const reference = isGlobalPayouts(organization.stripeAccountKind)
        ? (await findOrCreateOutboundPayment(clients, send)).id
        : (await findOrCreateTransfer(clients.connect, send)).id;

      const updated = await tx.payoutRequest.updateMany({
        where: { id: request.id, status: 'REQUESTED' },
        data: {
          status: 'PAID',
          rail: 'STRIPE',
          reference,
          resolvedAt: now,
          resolvedByUserId,
        },
      });
      if (updated.count === 0) {
        throw new ConflictError(
          `${reference} was sent but the request was already resolved or cancelled — reconcile by hand`
        );
      }
      return { reference };
    },
    { timeout: 30_000 }
  );
}

interface SendRequest {
  id: string;
  amountCents: number;
  createdAt: Date;
  destination: string;
  organizationId: string;
  slug: string;
}

const descriptionFor = (send: SendRequest) =>
  `TropTix payout — ${send.slug} — ${send.id.slice(0, 8)}`;

/**
 * Stripe replays a cached failure under a reused idempotency key for 24
 * hours, so the key is per attempt; the group lookup is what finds a transfer
 * whose response was lost. A reversed transfer paid nobody and is not reused.
 */
async function findOrCreateTransfer(
  stripe: Stripe,
  send: SendRequest
): Promise<Stripe.Transfer> {
  const group = transferGroupFor(send.id);
  const existing = await stripe.transfers.list({
    transfer_group: group,
    limit: 10,
  });
  const live = existing.data.find((transfer) => !transfer.reversed);
  if (live) return live;

  try {
    return await stripe.transfers.create(
      {
        amount: send.amountCents,
        currency: 'usd',
        destination: send.destination,
        description: descriptionFor(send),
        transfer_group: group,
        metadata: {
          payoutRequestId: send.id,
          organizationId: send.organizationId,
        },
      },
      { idempotencyKey: `${group}-${randomUUID()}` }
    );
  } catch (error) {
    throw await mapTransferError(stripe, error, send.amountCents);
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

/**
 * The Global Payouts branch (ADR 0034). v2 keys live 30 days and re-execute
 * a failure, so the key is the request's; the list by recipient and window
 * is the guard past that and for a lost response. The payout method is
 * named, never left to a Stripe-side default; the financial account is
 * topped up from the payments balance before the send.
 */
async function findOrCreateOutboundPayment(
  clients: PayoutClients,
  send: SendRequest
): Promise<{ id: string }> {
  const financialAccountId = clients.financialAccountId;
  if (!financialAccountId) {
    throw new ConflictError(
      'Global Payouts is not configured: no financial account'
    );
  }

  let deadCount = 0;
  for await (const payment of clients.global.v2.moneyManagement.outboundPayments.list(
    {
      recipient: send.destination,
      created_gte: send.createdAt.toISOString(),
      limit: 100,
    }
  )) {
    if (payment.metadata?.payoutRequestId !== send.id) continue;
    if (DEAD_PAYMENT_STATUSES.has(payment.status)) deadCount += 1;
    else return payment;
  }

  const payoutMethod = await pickPayoutMethod(clients.global, send.destination);
  await fundFinancialAccount(clients, financialAccountId, send);

  let payment;
  try {
    payment = await clients.global.v2.moneyManagement.outboundPayments.create(
      {
        from: { financial_account: financialAccountId, currency: 'usd' },
        to: { recipient: send.destination, payout_method: payoutMethod },
        amount: { value: send.amountCents, currency: 'usd' },
        description: descriptionFor(send),
        metadata: {
          payoutRequestId: send.id,
          organizationId: send.organizationId,
        },
      },
      { idempotencyKey: globalPayoutKeyFor(send.id, deadCount) }
    );
  } catch (error) {
    throw mapOutboundPaymentError(error);
  }
  if (DEAD_PAYMENT_STATUSES.has(payment.status)) {
    throw new ConflictError(
      `Stripe returned ${payment.id}, which is ${payment.status}; retry to create a new payment`
    );
  }
  return payment;
}

async function pickPayoutMethod(
  stripe: StripePreview,
  recipient: string
): Promise<string> {
  for await (const method of stripe.v2.moneyManagement.payoutMethods.list(
    { limit: 10 },
    { stripeContext: recipient }
  )) {
    if (
      method.type === 'bank_account' &&
      !method.restricted &&
      !method.bank_account?.archived &&
      method.usage_status.payments === 'eligible'
    ) {
      return method.id;
    }
  }
  throw new StripeAccountRestrictedError(
    'This recipient has no bank account Stripe can pay'
  );
}

/**
 * Fees are billed to the financial account separately, so the top-up covers
 * the amount plus headroom (plan decision 8). A v1 payout from the payments
 * balance into the financial account settles at once.
 */
async function fundFinancialAccount(
  clients: PayoutClients,
  financialAccountId: string,
  send: SendRequest
): Promise<void> {
  const account =
    await clients.global.v2.moneyManagement.financialAccounts.retrieve(
      financialAccountId
    );
  const available = account.balance.available.usd?.value ?? 0;
  const needed =
    send.amountCents + globalPayoutFeeHeadroomCents(send.amountCents);
  if (available >= needed) return;

  const topUp = needed - available;
  try {
    await clients.connect.payouts.create(
      {
        amount: topUp,
        currency: 'usd',
        payout_method: financialAccountId,
        description: descriptionFor(send),
        metadata: { payoutRequestId: send.id },
      },
      { idempotencyKey: `global-payout-${send.id}-fund-${randomUUID()}` }
    );
  } catch (error) {
    throw await mapTransferError(clients.connect, error, topUp);
  }
}

function mapOutboundPaymentError(error: unknown): unknown {
  const { code, rawType } = error as { code?: string; rawType?: string };
  const reason = code ?? rawType;
  if (!reason) return error;
  if (reason === 'insufficient_funds') {
    return new ConflictError(
      'The financial account top-up has not settled yet; retry in a minute'
    );
  }
  if (reason === 'outbound_payment_cannot_be_processed') {
    return new ConflictError('Stripe declined this payout in review');
  }
  if (RECIPIENT_LIMIT_CODES.has(reason)) {
    return new ConflictError(
      "This recipient has hit Stripe's payout limit for now; try again later"
    );
  }
  if (RECIPIENT_NOT_READY_CODES.has(reason)) {
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

async function financialAccountUsdCents(
  clients: PayoutClients
): Promise<number> {
  if (!clients.financialAccountId) return 0;
  const account =
    await clients.global.v2.moneyManagement.financialAccounts.retrieve(
      clients.financialAccountId
    );
  return account.balance.available.usd?.value ?? 0;
}

/**
 * The queue header (Connect plan decision 18, Global Payouts plan decision
 * 12): what Stripe can send, on either rail, against what the Stripe rails
 * owe. Manual-rail requests never draw on this balance.
 */
export async function readPlatformPayoutBalance(
  prisma: PrismaClient,
  clients: PayoutClients,
  actor: Actor
): Promise<PlatformPayoutBalance> {
  await requirePlatformOwner(prisma, actor);
  const [platformCents, financialAccountCents, open] = await Promise.all([
    availableUsdCents(clients.connect),
    financialAccountUsdCents(clients),
    prisma.payoutRequest.findMany({
      where: {
        status: 'REQUESTED',
        organization: {
          stripeAccountId: { not: null },
          stripeTransfersStatus: 'active',
        },
      },
      select: {
        amountCents: true,
        organization: { select: { stripeAccountKind: true } },
      },
    }),
  ]);
  // A recipient-rail request needs its fee headroom funded too.
  const openRequestsCents = open.reduce(
    (sum, request) =>
      sum +
      request.amountCents +
      (isGlobalPayouts(request.organization.stripeAccountKind)
        ? globalPayoutFeeHeadroomCents(request.amountCents)
        : 0),
    0
  );
  return {
    availableCents: platformCents + financialAccountCents,
    openRequestsCents,
  };
}

/**
 * The safety net under the idempotency rules (Connect plan decision 17,
 * Global Payouts plan decision 9): Stripe's live transfers and outbound
 * payments carrying a request id, against the rows. A payment that failed
 * or came back is reported on its own, since the row says paid. Not
 * actor-gated because the cron calls it; the platform page checks its
 * viewer first.
 */
export async function reconcileStripePayouts(
  prisma: PrismaClient,
  clients: PayoutClients,
  {
    now = new Date(),
    windowDays = 35,
  }: { now?: Date; windowDays?: number } = {}
): Promise<PayoutMismatch[]> {
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  const liveByRequest = new Map<string, string[]>();
  const deadByRequest = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, requestId: string, id: string) =>
    map.set(requestId, [...(map.get(requestId) ?? []), id]);

  for await (const transfer of clients.connect.transfers.list({
    created: { gte: Math.floor(since.getTime() / 1000) },
    limit: 100,
  })) {
    const requestId = transfer.metadata?.payoutRequestId;
    if (!requestId || transfer.reversed) continue;
    add(liveByRequest, requestId, transfer.id);
  }

  if (clients.financialAccountId) {
    for await (const payment of clients.global.v2.moneyManagement.outboundPayments.list(
      { created_gte: since.toISOString(), limit: 100 }
    )) {
      const requestId = payment.metadata?.payoutRequestId;
      if (!requestId) continue;
      add(
        DEAD_PAYMENT_STATUSES.has(payment.status)
          ? deadByRequest
          : liveByRequest,
        requestId,
        payment.id
      );
    }
  }

  const rows = await prisma.payoutRequest.findMany({
    where: {
      OR: [
        { status: 'REQUESTED' },
        { status: 'PAID', rail: 'STRIPE', resolvedAt: { gte: since } },
        {
          id: {
            in: [
              ...Array.from(liveByRequest.keys()),
              ...Array.from(deadByRequest.keys()),
            ],
          },
        },
      ],
    },
    select: { id: true, status: true, rail: true },
  });

  const mismatches: PayoutMismatch[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(row.id);
    const liveIds = liveByRequest.get(row.id) ?? [];
    const deadIds = deadByRequest.get(row.id) ?? [];
    const paidOnStripe = row.status === 'PAID' && row.rail === 'STRIPE';
    if (row.status === 'REQUESTED' && liveIds.length > 0) {
      mismatches.push({
        requestId: row.id,
        kind: 'requested_with_transfer',
        stripeIds: liveIds,
      });
    } else if (paidOnStripe && liveIds.length === 0 && deadIds.length > 0) {
      mismatches.push({
        requestId: row.id,
        kind: 'payment_returned',
        stripeIds: deadIds,
      });
    } else if (paidOnStripe && liveIds.length === 0) {
      mismatches.push({
        requestId: row.id,
        kind: 'paid_without_transfer',
        stripeIds: [],
      });
    } else if (paidOnStripe && liveIds.length > 1) {
      mismatches.push({
        requestId: row.id,
        kind: 'duplicate_transfer',
        stripeIds: liveIds,
      });
    } else if (
      !paidOnStripe &&
      row.status !== 'REQUESTED' &&
      liveIds.length > 0
    ) {
      mismatches.push({
        requestId: row.id,
        kind: 'closed_with_transfer',
        stripeIds: liveIds,
      });
    }
  }
  for (const [requestId, liveIds] of Array.from(liveByRequest)) {
    if (!seen.has(requestId)) {
      mismatches.push({
        requestId,
        kind: 'transfer_without_request',
        stripeIds: liveIds,
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
