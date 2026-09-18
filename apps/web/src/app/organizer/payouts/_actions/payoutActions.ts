'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/prisma';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import {
  cancelPayoutRequestInputSchema,
  requestPayoutInputSchema,
  type RequestPayoutInput,
} from '@troptix/api';
import {
  cancelPayoutRequest as cancelPayoutRequestService,
  requestPayout as requestPayoutService,
  InvalidPayoutAmountError,
  NotFoundError,
  PayoutRequestPendingError,
  PayoutSetupIncompleteError,
  UnauthorizedError,
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

function failure(error: unknown, fallback: string): ActionResult {
  if (error instanceof PayoutSetupIncompleteError) {
    return {
      success: false,
      error: 'Payout setup is not complete yet — contact us to finish it.',
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
