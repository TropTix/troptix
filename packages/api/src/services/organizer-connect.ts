/**
 * The Stripe rail's onboarding half (docs/plans/2026-09-stripe-connect-us-payout-rail.md).
 * Owner-only writes, never View-as. Stripe's transfers status is mirrored
 * into `stripeTransfersStatus` by the webhook and the onboarding return;
 * every read derives from the row (ADR 0032).
 */
import type { PrismaClient } from '@troptix/db';
import type Stripe from 'stripe';
import type { Actor } from '../trpc/context';
import type {
  ConnectReturnOutcome,
  ConnectSetup,
  ConnectState,
} from '../contracts/payouts';
import { NotFoundError, UnauthorizedError } from './_shared/errors';
import { ensureOrganizationForUser } from './organizations';
import { resolveOrganizerScope } from './organizer-scope';

const ORG_SELECT = {
  id: true,
  displayName: true,
  slug: true,
  stripeAccountId: true,
  payoutBankLinkedAt: true,
  owner: { select: { email: true } },
} as const;

interface ConnectOrg {
  id: string;
  displayName: string;
  slug: string;
  stripeAccountId: string | null;
  payoutBankLinkedAt: Date | null;
  owner: { email: string };
}

interface ConnectRow {
  stripeAccountId: string | null;
  stripeTransfersStatus: string | null;
  payoutBankLinkedAt: Date | string | null;
}

const ACCOUNT_INCLUDE: Stripe.V2.Core.AccountRetrieveParams['include'] = [
  'configuration.recipient',
  'requirements',
];

export function transfersStatus(
  account: Stripe.V2.Core.Account
): string | undefined {
  return account.configuration?.recipient?.capabilities?.stripe_balance
    ?.stripe_transfers?.status;
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
      stripeTransfersStatus: true,
      payoutBankLinkedAt: true,
    },
  });
  if (!org) return { accountId: null, state: 'manual' };
  return { accountId: org.stripeAccountId, state: connectStateOf(org) };
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

async function syncTransfersStatus(
  prisma: PrismaClient,
  stripe: Stripe,
  org: { id: string; stripeAccountId: string },
  now: Date
): Promise<string | undefined> {
  const account = await stripe.v2.core.accounts.retrieve(org.stripeAccountId, {
    include: ACCOUNT_INCLUDE,
  });
  const status = transfersStatus(account);
  await recordTransfersStatus(prisma, org.id, status, now);
  return status;
}

/**
 * A payouts visit can come before the first event, which is what otherwise
 * provisions the Organization (organizer-event-write). Connecting a bank is
 * as good a first act as creating an event, so `provision` does the same.
 */
async function ownedOrg(
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
  accountId: string,
  baseUrl: string
): Stripe.V2.Core.AccountLinkCreateParams {
  return {
    account: accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['recipient', 'merchant'],
        refresh_url: `${baseUrl}/organizer/payouts/stripe/refresh`,
        return_url: `${baseUrl}/organizer/payouts/stripe/return`,
        collection_options: { fields: 'eventually_due' },
      },
    },
  };
}

/**
 * Stripe's idempotency key makes a double click return the same account; the
 * guarded update makes the second writer adopt the first's id instead of
 * overwriting it.
 *
 * `card_payments` is requested only because Stripe refuses
 * `stripe_transfers` without it unless the platform has been approved for
 * transfers-only accounts (error `capability_not_available_without_other_capability`).
 * Nothing charges through the account; the merchant configuration is
 * Stripe's precondition, not a product decision (ADR 0030).
 */
async function createRecipientAccount(
  prisma: PrismaClient,
  stripe: Stripe,
  org: ConnectOrg,
  baseUrl: string
): Promise<string> {
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

  const claimed = await prisma.organization.updateMany({
    where: { id: org.id, stripeAccountId: null },
    data: { stripeAccountId: account.id },
  });
  if (claimed.count === 1) return account.id;

  const current = await prisma.organization.findUnique({
    where: { id: org.id },
    select: { stripeAccountId: true },
  });
  return current?.stripeAccountId ?? account.id;
}

export async function startStripeOnboarding(
  prisma: PrismaClient,
  stripe: Stripe,
  actor: Actor,
  input: { baseUrl: string }
): Promise<{ url: string }> {
  const org = await ownedOrg(prisma, actor, { provision: true });
  const accountId =
    org.stripeAccountId ??
    (await createRecipientAccount(prisma, stripe, org, input.baseUrl));
  const link = await stripe.v2.core.accountLinks.create(
    onboardingLink(accountId, input.baseUrl)
  );
  return { url: link.url };
}

/** An expired or reused link lands here; without an account there is nothing to refresh. */
export async function refreshStripeOnboarding(
  prisma: PrismaClient,
  stripe: Stripe,
  actor: Actor,
  input: { baseUrl: string }
): Promise<{ url: string | null }> {
  const org = await ownedOrg(prisma, actor);
  if (!org.stripeAccountId) return { url: null };
  const link = await stripe.v2.core.accountLinks.create(
    onboardingLink(org.stripeAccountId, input.baseUrl)
  );
  return { url: link.url };
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
  stripe: Stripe,
  actor: Actor,
  now: Date = new Date()
): Promise<ConnectReturnOutcome> {
  const org = await ownedOrg(prisma, actor);
  if (!org.stripeAccountId) return 'incomplete';
  let status: string | undefined;
  try {
    status = await syncTransfersStatus(
      prisma,
      stripe,
      { id: org.id, stripeAccountId: org.stripeAccountId },
      now
    );
  } catch {
    return 'pending';
  }
  if (status === 'active') return 'active';
  return status === 'pending' ? 'pending' : 'incomplete';
}

export async function createStripeDashboardLink(
  prisma: PrismaClient,
  stripe: Stripe,
  actor: Actor
): Promise<{ url: string }> {
  const org = await ownedOrg(prisma, actor);
  if (!org.stripeAccountId) {
    throw new NotFoundError('This organization has no Stripe account');
  }
  const link = await stripe.accounts.createLoginLink(org.stripeAccountId);
  return { url: link.url };
}
