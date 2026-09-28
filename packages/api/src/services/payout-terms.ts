import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type { AcceptPayoutTermsInput, PayoutTerms } from '../contracts/payouts';
import { PAYOUT_TERMS } from '../legal/payoutTerms';
import { organizationsWhereCan } from './_shared/access';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from './_shared/errors';

export function currentPayoutTerms(): PayoutTerms {
  return PAYOUT_TERMS;
}

export function termsAccepted(org: {
  payoutTermsVersion: string | null;
}): boolean {
  return org.payoutTermsVersion === PAYOUT_TERMS.version;
}

/**
 * Owner-only, like every payout write. The version in the input is the one
 * the Owner read; a stale page must not record assent to words it never
 * showed.
 */
export async function acceptPayoutTerms(
  prisma: PrismaClient,
  actor: Actor,
  input: AcceptPayoutTermsInput,
  now: Date = new Date()
): Promise<void> {
  if (actor.kind !== 'user') {
    throw new UnauthorizedError('Sign in to accept the payout terms');
  }
  if (input.version !== PAYOUT_TERMS.version) {
    throw new ConflictError(
      'The payout terms changed while you were reading. Reload and review the new version.'
    );
  }
  const updated = await prisma.organization.updateMany({
    where: organizationsWhereCan(actor.userId, 'organization.payouts'),
    data: { payoutTermsAcceptedAt: now, payoutTermsVersion: input.version },
  });
  if (updated.count === 0) {
    throw new NotFoundError('Organization not found');
  }
}
