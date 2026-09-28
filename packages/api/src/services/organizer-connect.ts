/**
 * The Stripe rail's onboarding half (docs/plans/2026-09-stripe-connect-us-payout-rail.md,
 * docs/plans/2026-09-global-payouts-rail.md). Owner-only writes, never
 * View-as. The payout capability's status is mirrored into
 * `stripeTransfersStatus` by the webhook and the onboarding return; every
 * read derives from the row (ADR 0032). A Connect account and a Global
 * Payouts recipient are the same v2 account object; the kind says which
 * client and which capability apply (ADR 0034).
 */
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import type StripePreview from 'stripe-preview';
import type { Actor } from '../trpc/context';
import type {
  ConnectReturnOutcome,
  ConnectSetup,
  ConnectState,
  StripeAccountKind,
} from '../contracts/payouts';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from './_shared/errors';
import { ensureOrganizationForUser } from './organizations';
import { resolveOrganizerScope } from './organizer-scope';

/**
 * The GA client makes every Connect call; the preview client makes the
 * recipient and money-management calls, which exist only on the preview API
 * version and, live, only under a restricted key.
 */
export interface PayoutClients {
  connect: Stripe;
  global: StripePreview;
}

const ORG_SELECT = {
  id: true,
  displayName: true,
  slug: true,
  stripeAccountId: true,
  stripeAccountKind: true,
  payoutBankLinkedAt: true,
  owner: { select: { email: true } },
} as const;

export interface ConnectOrg {
  id: string;
  displayName: string;
  slug: string;
  stripeAccountId: string | null;
  stripeAccountKind: string | null;
  payoutBankLinkedAt: Date | null;
  owner: { email: string };
}

interface ConnectRow {
  stripeAccountId: string | null;
  stripeTransfersStatus: string | null;
  payoutBankLinkedAt: Date | string | null;
}

export interface StripeAccountRef {
  stripeAccountId: string;
  stripeAccountKind: string | null;
}

const ACCOUNT_INCLUDE = ['configuration.recipient', 'requirements'] as const;

/**
 * The shape both SDKs' account objects share where the payout capability
 * lives. `bank_accounts` exists only on the preview version's type.
 */
export interface PayoutCapabilityAccount {
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: { stripe_transfers?: { status: string } } | null;
        bank_accounts?: { local?: { status: string } } | null;
      } | null;
    } | null;
  } | null;
}

export function transfersStatus(
  account: PayoutCapabilityAccount
): string | undefined {
  const capabilities = account.configuration?.recipient?.capabilities;
  return (
    capabilities?.bank_accounts?.local?.status ??
    capabilities?.stripe_balance?.stripe_transfers?.status
  );
}

export function isGlobalPayouts(kind: string | null | undefined): boolean {
  return kind === ('GLOBAL_PAYOUTS' satisfies StripeAccountKind);
}

export function toAccountKind(
  kind: string | null | undefined
): StripeAccountKind | null {
  return kind === 'CONNECT' || kind === 'GLOBAL_PAYOUTS' ? kind : null;
}

/**
 * A restriction after the gate was stamped is "needs updates"; the same
 * status before it is still "in progress". The gate is never cleared.
 */
export function connectStateOf(row: ConnectRow): ConnectState {
  if (!row.stripeAccountId) return 'manual';
  if (row.stripeTransfersStatus === 'active') return 'active';
  if (row.stripeTransfersStatus === 'pending') return 'pending';
  return row.payoutBankLinkedAt !== null ? 'needs_updates' : 'in_progress';
}

export function getConnectStates(
  rows: ReadonlyArray<ConnectRow & { id: string }>
): Record<string, ConnectState> {
  return Object.fromEntries(
    rows
      .filter((row) => row.stripeAccountId)
      .map((row) => [row.id, connectStateOf(row)] as const)
  );
}

export async function getConnectSetup(
  prisma: PrismaClient,
  actor: Actor,
  input: { viewAsOrganizerUserId?: string } = {}
): Promise<ConnectSetup> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );
  const org = await prisma.organization.findFirst({
    where: { ownerUserId: organizerUserId },
    select: {
      stripeAccountId: true,
      stripeAccountKind: true,
      stripeTransfersStatus: true,
      payoutBankLinkedAt: true,
    },
  });
  if (!org) return { accountId: null, kind: null, state: 'manual' };
  return {
    accountId: org.stripeAccountId,
    kind: toAccountKind(org.stripeAccountKind),
    state: connectStateOf(org),
  };
}

/**
 * The one write both syncs share. Idempotent with itself: the webhook and the
 * return route may record the same status, and the stamp lands once.
 */
export async function recordTransfersStatus(
  prisma: PrismaClient,
  organizationId: string,
  status: string | undefined,
  now: Date
): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeTransfersStatus: status ?? null },
  });
  if (status === 'active') await stampBankLinked(prisma, organizationId, now);
}

export async function retrieveAccount(
  clients: PayoutClients,
  account: StripeAccountRef
): Promise<PayoutCapabilityAccount> {
  if (isGlobalPayouts(account.stripeAccountKind)) {
    return clients.global.v2.core.accounts.retrieve(account.stripeAccountId, {
      include: [...ACCOUNT_INCLUDE],
    });
  }
  return clients.connect.v2.core.accounts.retrieve(account.stripeAccountId, {
    include: [...ACCOUNT_INCLUDE],
  });
}

async function syncTransfersStatus(
  prisma: PrismaClient,
  clients: PayoutClients,
  org: { id: string } & StripeAccountRef,
  now: Date
): Promise<string | undefined> {
  const status = transfersStatus(await retrieveAccount(clients, org));
  await recordTransfersStatus(prisma, org.id, status, now);
  return status;
}

/**
 * A payouts visit can come before the first event, which is what otherwise
 * provisions the Organization (organizer-event-write). Connecting a bank is
 * as good a first act as creating an event, so `provision` does the same.
 */
export async function ownedOrg(
  prisma: PrismaClient,
  actor: Actor,
  opts: { provision?: boolean } = {}
): Promise<ConnectOrg> {
  if (actor.kind !== 'user') {
    throw new UnauthorizedError('Sign in to manage payouts');
  }
  const select = { where: { ownerUserId: actor.userId }, select: ORG_SELECT };
  const org = await prisma.organization.findFirst(select);
  if (org) return org;
  if (!opts.provision) throw new NotFoundError('Organization not found');

  const user = await prisma.users.findUnique({
    where: { id: actor.userId },
    select: { email: true },
  });
  await ensureOrganizationForUser(prisma, {
    ownerUserId: actor.userId,
    displayName: user?.email ?? '',
  });
  const created = await prisma.organization.findFirst(select);
  if (!created) throw new NotFoundError('Organization not found');
  return created;
}

function onboardingLink(
  account: StripeAccountRef,
  baseUrl: string
): Stripe.V2.Core.AccountLinkCreateParams {
  return {
    account: account.stripeAccountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: isGlobalPayouts(account.stripeAccountKind)
          ? ['recipient']
          : ['recipient', 'merchant'],
        refresh_url: `${baseUrl}/organizer/payouts/stripe/refresh`,
        return_url: `${baseUrl}/organizer/payouts/stripe/return`,
        collection_options: { fields: 'eventually_due' },
      },
    },
  };
}

/** A hosted-onboarding link for an existing account, from the client its kind needs. */
export async function mintOnboardingLink(
  clients: PayoutClients,
  account: StripeAccountRef,
  baseUrl: string
): Promise<string> {
  const params = onboardingLink(account, baseUrl);
  const link = isGlobalPayouts(account.stripeAccountKind)
    ? await clients.global.v2.core.accountLinks.create(params)
    : await clients.connect.v2.core.accountLinks.create(params);
  return link.url;
}

/**
 * The guarded update makes the second writer adopt the first's account
 * instead of overwriting it; Stripe's idempotency key on the create has
 * already made a double click return the same account.
 */
export async function claimStripeAccount(
  prisma: PrismaClient,
  organizationId: string,
  account: { id: string; kind: StripeAccountKind }
): Promise<StripeAccountRef> {
  const claimed = await prisma.organization.updateMany({
    where: { id: organizationId, stripeAccountId: null },
    data: { stripeAccountId: account.id, stripeAccountKind: account.kind },
  });
  if (claimed.count === 1) {
    return { stripeAccountId: account.id, stripeAccountKind: account.kind };
  }

  const current = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeAccountId: true, stripeAccountKind: true },
  });
  return current?.stripeAccountId
    ? {
        stripeAccountId: current.stripeAccountId,
        stripeAccountKind: current.stripeAccountKind,
      }
    : { stripeAccountId: account.id, stripeAccountKind: account.kind };
}

/**
 * `card_payments` is requested only because Stripe refuses
 * `stripe_transfers` without it unless the platform has been approved for
 * transfers-only accounts (error `capability_not_available_without_other_capability`).
 * Nothing charges through the account; the merchant configuration is
 * Stripe's precondition, not a product decision (ADR 0030).
 */
async function createConnectAccount(
  prisma: PrismaClient,
  stripe: Stripe,
  org: ConnectOrg,
  baseUrl: string
): Promise<StripeAccountRef> {
  // Stripe rejects localhost as a business URL (url_invalid), so local dev
  // leaves the field for the form to collect.
  const profile = baseUrl.startsWith('https://')
    ? { business_url: `${baseUrl}/o/${org.slug}` }
    : undefined;
  const account = await stripe.v2.core.accounts.create(
    {
      display_name: org.displayName,
      contact_email: org.owner.email,
      dashboard: 'express',
      identity: { country: 'us' },
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
        ...(profile ? { profile } : {}),
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
      metadata: { organizationId: org.id },
    },
    { idempotencyKey: `connect-account-${org.id}` }
  );
  return claimStripeAccount(prisma, org.id, {
    id: account.id,
    kind: 'CONNECT',
  });
}

/** The Connect path: a US organizer. An existing account of either kind is linked, not replaced. */
export async function startStripeOnboarding(
  prisma: PrismaClient,
  clients: PayoutClients,
  actor: Actor,
  input: { baseUrl: string }
): Promise<{ url: string }> {
  const org = await ownedOrg(prisma, actor, { provision: true });
  const account = org.stripeAccountId
    ? {
        stripeAccountId: org.stripeAccountId,
        stripeAccountKind: org.stripeAccountKind,
      }
    : await createConnectAccount(prisma, clients.connect, org, input.baseUrl);
  return { url: await mintOnboardingLink(clients, account, input.baseUrl) };
}

/** An expired or reused link lands here; without an account there is nothing to refresh. */
export async function refreshStripeOnboarding(
  prisma: PrismaClient,
  clients: PayoutClients,
  actor: Actor,
  input: { baseUrl: string }
): Promise<{ url: string | null }> {
  const org = await ownedOrg(prisma, actor);
  if (!org.stripeAccountId) return { url: null };
  return {
    url: await mintOnboardingLink(
      clients,
      {
        stripeAccountId: org.stripeAccountId,
        stripeAccountKind: org.stripeAccountKind,
      },
      input.baseUrl
    ),
  };
}

async function stampBankLinked(
  prisma: PrismaClient,
  organizationId: string,
  now: Date
): Promise<void> {
  await prisma.organization.updateMany({
    where: { id: organizationId, payoutBankLinkedAt: null },
    data: { payoutBankLinkedAt: now },
  });
}

/**
 * Stripe's return_url carries no state and does not mean the form finished,
 * so this is the one sync outside the webhook (Stripe's return-URL guidance;
 * it also covers a preview deploy, which receives no events). An unreachable
 * Stripe leaves the row alone and reads as `pending`: the webhook will still
 * record the status when it arrives.
 */
export async function finishStripeOnboardingReturn(
  prisma: PrismaClient,
  clients: PayoutClients,
  actor: Actor,
  now: Date = new Date()
): Promise<ConnectReturnOutcome> {
  const org = await ownedOrg(prisma, actor);
  if (!org.stripeAccountId) return 'incomplete';
  let status: string | undefined;
  try {
    status = await syncTransfersStatus(
      prisma,
      clients,
      {
        id: org.id,
        stripeAccountId: org.stripeAccountId,
        stripeAccountKind: org.stripeAccountKind,
      },
      now
    );
  } catch {
    return 'pending';
  }
  if (status === 'active') return 'active';
  return status === 'pending' ? 'pending' : 'incomplete';
}

/** Connect only: a Global Payouts recipient has no dashboard. */
export async function createStripeDashboardLink(
  prisma: PrismaClient,
  stripe: Stripe,
  actor: Actor
): Promise<{ url: string }> {
  const org = await ownedOrg(prisma, actor);
  if (!org.stripeAccountId) {
    throw new NotFoundError('This organization has no Stripe account');
  }
  if (isGlobalPayouts(org.stripeAccountKind)) {
    throw new ConflictError(
      'Payouts to a bank outside the US have no Stripe dashboard; your bank statement shows each deposit'
    );
  }
  const link = await stripe.accounts.createLoginLink(org.stripeAccountId);
  return { url: link.url };
}
