/**
 * The Stripe rail's onboarding half (docs/plans/2026-09-stripe-connect-us-payout-rail.md).
 * Owner-only writes, never View-as. Stripe's status is read live at the two
 * moments that need it and never cached (ADR 0030).
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
  payoutBankLinkedAt: Date | null;
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

export function stateFromStatus(
  status: string | undefined,
  linked: boolean
): ConnectState {
  if (status === 'active') return 'active';
  if (status === 'pending') return 'pending';
  return linked ? 'needs_updates' : 'in_progress';
}

export async function readConnectState(
  stripe: Stripe,
  row: ConnectRow
): Promise<ConnectState> {
  if (!row.stripeAccountId) return 'manual';
  let account: Stripe.V2.Core.Account;
  try {
    account = await stripe.v2.core.accounts.retrieve(row.stripeAccountId, {
      include: ACCOUNT_INCLUDE,
    });
  } catch {
    return 'unavailable';
  }
  return stateFromStatus(
    transfersStatus(account),
    row.payoutBankLinkedAt !== null
  );
}

export async function getConnectStates(
  stripe: Stripe,
  rows: ReadonlyArray<ConnectRow & { id: string }>
): Promise<Record<string, ConnectState>> {
  const entries = await Promise.all(
    rows
      .filter((row) => row.stripeAccountId)
      .map(
        async (row) => [row.id, await readConnectState(stripe, row)] as const
      )
  );
  return Object.fromEntries(entries);
}

/**
 * Verification can finish after the organizer has already returned, and a
 * preview deploy receives no webhooks, so the page read is the third place
 * that may see `active` first. It stamps the gate too, unless the viewer is
 * only looking through View-as.
 */
export async function getConnectSetup(
  prisma: PrismaClient,
  stripe: Stripe,
  actor: Actor,
  input: { viewAsOrganizerUserId?: string } = {},
  now: Date = new Date()
): Promise<ConnectSetup> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );
  const org = await prisma.organization.findFirst({
    where: { ownerUserId: organizerUserId },
    select: { id: true, stripeAccountId: true, payoutBankLinkedAt: true },
  });
  if (!org) return { accountId: null, state: 'manual' };
  const state = await readConnectState(stripe, org);
  const viewing = actor.kind === 'user' && organizerUserId !== actor.userId;
  if (state === 'active' && org.payoutBankLinkedAt === null && !viewing) {
    await stampBankLinked(prisma, org.id, now);
  }
  return { accountId: org.stripeAccountId, state };
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

/** Idempotent with the webhook: whichever sees `active` first stamps the gate. */
export async function stampBankLinked(
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
 * so the outcome comes from a live read. An unreachable Stripe reads as
 * `pending`: the webhook will still stamp the gate if the account is active.
 */
export async function finishStripeOnboardingReturn(
  prisma: PrismaClient,
  stripe: Stripe,
  actor: Actor,
  now: Date = new Date()
): Promise<ConnectReturnOutcome> {
  const org = await ownedOrg(prisma, actor);
  if (!org.stripeAccountId) return 'incomplete';
  const state = await readConnectState(stripe, org);
  if (state === 'active') {
    await stampBankLinked(prisma, org.id, now);
    return 'active';
  }
  return state === 'pending' || state === 'unavailable'
    ? 'pending'
    : 'incomplete';
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
