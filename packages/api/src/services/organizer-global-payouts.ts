/**
 * The Global Payouts rail's onboarding half (docs/plans/2026-09-global-payouts-rail.md,
 * ADR 0034): a recipient account for an organizer whose bank is outside the
 * United States. Same hosted onboarding, return route and webhook as Connect;
 * only the account shape and the client differ.
 */
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { findPayoutCountry } from '../contracts/payoutCountries';
import type { StartGlobalPayoutsOnboardingInput } from '../contracts/payouts';
import { ConflictError } from './_shared/errors';
import {
  claimStripeAccount,
  mintOnboardingLink,
  ownedOrg,
  type ConnectOrg,
  type PayoutClients,
  type StripeAccountRef,
} from './organizer-connect';

/**
 * Country and entity type go straight to Stripe and are never stored; the
 * hosted form collects what that country requires. An organization that
 * already has an account of either kind is linked, not given a second one.
 */
export async function startGlobalPayoutsOnboarding(
  prisma: PrismaClient,
  clients: PayoutClients,
  actor: Actor,
  input: StartGlobalPayoutsOnboardingInput & { baseUrl: string }
): Promise<{ url: string }> {
  const country = findPayoutCountry(input.country);
  if (!country) {
    throw new ConflictError('Stripe cannot pay a bank in that country yet');
  }
  const org = await ownedOrg(prisma, actor, { provision: true });
  const account = org.stripeAccountId
    ? {
        stripeAccountId: org.stripeAccountId,
        stripeAccountKind: org.stripeAccountKind,
      }
    : await createRecipientAccount(prisma, clients, org, {
        country: country.code,
        entityType: input.entityType,
      });
  return { url: await mintOnboardingLink(clients, account, input.baseUrl) };
}

async function createRecipientAccount(
  prisma: PrismaClient,
  clients: PayoutClients,
  org: ConnectOrg,
  input: { country: string; entityType: 'individual' | 'company' }
): Promise<StripeAccountRef> {
  const account = await clients.global.v2.core.accounts.create(
    {
      display_name: org.displayName,
      contact_email: org.owner.email,
      identity: {
        country: input.country.toLowerCase(),
        entity_type: input.entityType,
      },
      configuration: {
        recipient: {
          capabilities: { bank_accounts: { local: { requested: true } } },
        },
      },
      metadata: { organizationId: org.id },
    },
    { idempotencyKey: `global-payouts-account-${org.id}` }
  );
  return claimStripeAccount(prisma, org.id, {
    id: account.id,
    kind: 'GLOBAL_PAYOUTS',
  });
}
