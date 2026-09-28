'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import prisma from '@/server/prisma';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import { stripe } from '@/server/lib/stripe';
import { payoutClients } from '@/server/lib/stripePayouts';
import { isFlagEnabled } from '@/server/lib/featureFlags';
import { getRequestOrigin } from '@/server/lib/requestOrigin';
import {
  acceptPayoutTermsInputSchema,
  cancelPayoutRequestInputSchema,
  FeatureFlag,
  requestPayoutInputSchema,
  startGlobalPayoutsOnboardingInputSchema,
  type AcceptPayoutTermsInput,
  type RequestPayoutInput,
  type StartGlobalPayoutsOnboardingInput,
} from '@troptix/api';
import {
  acceptPayoutTerms as acceptPayoutTermsService,
  cancelPayoutRequest as cancelPayoutRequestService,
  createStripeDashboardLink,
  requestPayout as requestPayoutService,
  startGlobalPayoutsOnboarding as startGlobalPayoutsOnboardingService,
  startStripeOnboarding as startStripeOnboardingService,
  InvalidPayoutAmountError,
  NotFoundError,
  PayoutRequestPendingError,
  PayoutSetupIncompleteError,
  PayoutTermsNotAcceptedError,
  UnauthorizedError,
  ConflictError,
} from '@troptix/api/server';

interface ActionResult {
  success: boolean;
  error?: string;
}

export async function requestPayout(
  input: RequestPayoutInput
): Promise<ActionResult> {
  const parsed = requestPayoutInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Enter a valid amount.' };
  }

  const user = await getServerUser();
  if (!user) {
    return { success: false, error: 'Authentication required.' };
  }

  try {
    await requestPayoutService(prisma, userToActor(user), parsed.data);
    revalidatePath('/organizer/payouts');
    return { success: true };
  } catch (error) {
    return failure(error, 'Failed to request the payout. Please try again.');
  }
}

export async function acceptPayoutTerms(
  input: AcceptPayoutTermsInput
): Promise<ActionResult> {
  const parsed = acceptPayoutTermsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid request.' };
  }

  const user = await getServerUser();
  if (!user) {
    return { success: false, error: 'Authentication required.' };
  }

  try {
    await acceptPayoutTermsService(prisma, userToActor(user), parsed.data);
    revalidatePath('/organizer/payouts');
    return { success: true };
  } catch (error) {
    if (error instanceof ConflictError) {
      return { success: false, error: error.message };
    }
    return failure(
      error,
      'Could not record your acceptance. Please try again.'
    );
  }
}

export async function cancelPayoutRequest(id: string): Promise<ActionResult> {
  const parsed = cancelPayoutRequestInputSchema.safeParse({ id });
  if (!parsed.success) {
    return { success: false, error: 'Invalid request.' };
  }

  const user = await getServerUser();
  if (!user) {
    return { success: false, error: 'Authentication required.' };
  }

  try {
    await cancelPayoutRequestService(prisma, userToActor(user), parsed.data);
    revalidatePath('/organizer/payouts');
    return { success: true };
  } catch (error) {
    return failure(error, 'Failed to cancel the request. Please try again.');
  }
}

/**
 * Ends in a redirect to Stripe's single-use link, so the link never crosses
 * the wire as data. `redirect()` throws and must stay outside the try.
 */
export async function startStripeOnboarding(): Promise<ActionResult> {
  const user = await getServerUser();
  if (!user) {
    return { success: false, error: 'Authentication required.' };
  }
  if (
    !(await isFlagEnabled(FeatureFlag.STRIPE_CONNECT_ONBOARDING, {
      id: user.uid,
      email: user.email,
    }))
  ) {
    return { success: false, error: 'Stripe payouts are not available yet.' };
  }

  let url: string;
  try {
    ({ url } = await startStripeOnboardingService(
      prisma,
      payoutClients,
      userToActor(user),
      { baseUrl: await getRequestOrigin() }
    ));
  } catch (error) {
    return failure(error, 'Could not start Stripe setup. Please try again.');
  }
  redirect(url);
}

/** The Global Payouts path: a bank outside the United States (ADR 0034). */
export async function startGlobalPayoutsOnboarding(
  input: StartGlobalPayoutsOnboardingInput
): Promise<ActionResult> {
  const parsed = startGlobalPayoutsOnboardingInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Choose a country to continue.' };
  }

  const user = await getServerUser();
  if (!user) {
    return { success: false, error: 'Authentication required.' };
  }
  if (
    !(await isFlagEnabled(FeatureFlag.GLOBAL_PAYOUTS_ONBOARDING, {
      id: user.uid,
      email: user.email,
    }))
  ) {
    return {
      success: false,
      error: 'Stripe payouts outside the US are not available yet.',
    };
  }

  let url: string;
  try {
    ({ url } = await startGlobalPayoutsOnboardingService(
      prisma,
      payoutClients,
      userToActor(user),
      { ...parsed.data, baseUrl: await getRequestOrigin() }
    ));
  } catch (error) {
    if (error instanceof ConflictError) {
      return { success: false, error: error.message };
    }
    return failure(error, 'Could not start Stripe setup. Please try again.');
  }
  redirect(url);
}

export async function openStripeDashboard(): Promise<ActionResult> {
  const user = await getServerUser();
  if (!user) {
    return { success: false, error: 'Authentication required.' };
  }

  let url: string;
  try {
    ({ url } = await createStripeDashboardLink(
      prisma,
      stripe,
      userToActor(user)
    ));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { success: false, error: 'No Stripe account is connected yet.' };
    }
    return failure(
      error,
      'Could not open your Stripe dashboard. Please try again.'
    );
  }
  redirect(url);
}

function failure(error: unknown, fallback: string): ActionResult {
  if (error instanceof PayoutSetupIncompleteError) {
    return {
      success: false,
      error: 'Payout setup is not complete yet — contact us to finish it.',
    };
  }
  if (error instanceof PayoutTermsNotAcceptedError) {
    return {
      success: false,
      error: 'Accept the payout terms before requesting a payout.',
    };
  }
  if (error instanceof PayoutRequestPendingError) {
    return {
      success: false,
      error: 'You already have an open payout request.',
    };
  }
  if (error instanceof InvalidPayoutAmountError) {
    return {
      success: false,
      error: 'The amount is more than your available balance.',
    };
  }
  if (error instanceof NotFoundError) {
    return { success: false, error: 'Request not found or already resolved.' };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: 'Authentication required.' };
  }
  console.error('Payout action failed:', error);
  return { success: false, error: fallback };
}
