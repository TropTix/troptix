'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/prisma';
import { getServerUser } from '@/server/authUser';
import type { Actor } from '@troptix/api/server';
import { userToActor } from '@/server/actor';
import { stripe } from '@/server/lib/stripe';
import { formatCents } from '@/lib/dateUtils';
import {
  resolvePayoutRequestInputSchema,
  sendPayoutViaStripeInputSchema,
  setPayoutPolicyInputSchema,
  setPayoutSetupStepInputSchema,
  type ResolvePayoutRequestInput,
  type SendPayoutViaStripeInput,
  type SetPayoutPolicyInput,
  type SetPayoutSetupStepInput,
} from '@troptix/api';
import {
  resolvePayoutRequest as resolvePayoutRequestService,
  sendPayoutViaStripe as sendPayoutViaStripeService,
  setPayoutPolicy as setPayoutPolicyService,
  setPayoutSetupStep as setPayoutSetupStepService,
  ConflictError,
  InsufficientPlatformBalanceError,
  NotFoundError,
  StripeAccountRestrictedError,
  UnauthorizedError,
} from '@troptix/api/server';

interface ActionResult {
  success: boolean;
  error?: string;
}

export async function resolvePayoutRequest(
  input: ResolvePayoutRequestInput
): Promise<ActionResult> {
  return run(resolvePayoutRequestInputSchema.safeParse(input), (actor, data) =>
    resolvePayoutRequestService(prisma, actor, data)
  );
}

export async function sendPayoutViaStripe(
  input: SendPayoutViaStripeInput
): Promise<ActionResult> {
  return run(sendPayoutViaStripeInputSchema.safeParse(input), (actor, data) =>
    sendPayoutViaStripeService(prisma, stripe, actor, data)
  );
}

export async function setPayoutSetupStep(
  input: SetPayoutSetupStepInput
): Promise<ActionResult> {
  return run(setPayoutSetupStepInputSchema.safeParse(input), (actor, data) =>
    setPayoutSetupStepService(prisma, actor, data)
  );
}

export async function setPayoutPolicy(
  input: SetPayoutPolicyInput
): Promise<ActionResult> {
  return run(setPayoutPolicyInputSchema.safeParse(input), (actor, data) =>
    setPayoutPolicyService(prisma, actor, data)
  );
}

async function run<T>(
  parsed: { success: true; data: T } | { success: false },
  service: (actor: Actor, data: T) => Promise<unknown>
): Promise<ActionResult> {
  if (!parsed.success) {
    return { success: false, error: 'Invalid input.' };
  }

  const user = await getServerUser();
  if (!user) {
    return { success: false, error: 'Authentication required.' };
  }

  try {
    await service(userToActor(user), parsed.data);
    revalidatePath('/organizer/platform/payouts');
    revalidatePath('/organizer/payouts');
    return { success: true };
  } catch (error) {
    if (error instanceof ConflictError) {
      return { success: false, error: error.message };
    }
    if (error instanceof InsufficientPlatformBalanceError) {
      const short =
        error.shortfallCents === null
          ? 'short'
          : `${formatCents(error.shortfallCents)} short`;
      return {
        success: false,
        error: `The platform balance is ${short}. Wait for the next sweep to leave the floor, or top up, then retry.`,
      };
    }
    if (error instanceof StripeAccountRestrictedError) {
      return {
        success: false,
        error:
          'Stripe has paused this account until the organizer updates their details.',
      };
    }
    if (error instanceof NotFoundError) {
      return { success: false, error: 'Not found.' };
    }
    if (error instanceof UnauthorizedError) {
      return { success: false, error: 'Not authorized.' };
    }
    console.error('Platform payout action failed:', error);
    return { success: false, error: 'Something went wrong. Please retry.' };
  }
}
