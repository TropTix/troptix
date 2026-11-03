'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import prisma from '@/server/prisma';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import { isFlagEnabled } from '@/server/lib/featureFlags';
import { FeatureFlag } from '@troptix/api';
import type { CreateGrantInput, UpdateGrantInput } from '@troptix/api';
import {
  createGrant as createGrantService,
  updateGrant as updateGrantService,
  revokeGrant as revokeGrantService,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '@troptix/api/server';

type Failure = { success: false; error: string };
type ActionResult<T = object> = ({ success: true } & T) | Failure;

async function guestAccessActor() {
  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }
  if (
    !(await isFlagEnabled(FeatureFlag.GUEST_ACCESS, {
      id: user.uid,
      email: user.email,
    }))
  ) {
    return null;
  }
  return userToActor(user);
}

function failure(error: unknown, fallback: string): Failure {
  if (error instanceof ConflictError) {
    return { success: false, error: error.message };
  }
  if (error instanceof NotFoundError) {
    return { success: false, error: 'Access code or event not found.' };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: 'Authentication required.' };
  }
  if (error instanceof ZodError) {
    return {
      success: false,
      error: error.errors[0]?.message || 'Check the form and try again.',
    };
  }
  console.error('Access code write failed:', error);
  return { success: false, error: fallback };
}

const UNAVAILABLE: Failure = {
  success: false,
  error: 'Access codes are not available yet.',
};

export async function createGrant(
  eventId: string,
  input: CreateGrantInput
): Promise<ActionResult<{ code: string }>> {
  const actor = await guestAccessActor();
  if (!actor) return UNAVAILABLE;
  try {
    const { code } = await createGrantService(prisma, actor, eventId, input);
    revalidatePath(`/organizer/events/${eventId}/access-codes`);
    revalidatePath(`/organizer/events/${eventId}/tickets`);
    return { success: true, code };
  } catch (error) {
    return failure(error, "Couldn't create the code. Please try again.");
  }
}

export async function updateGrant(
  eventId: string,
  grantId: string,
  input: UpdateGrantInput
): Promise<ActionResult> {
  const actor = await guestAccessActor();
  if (!actor) return UNAVAILABLE;
  try {
    await updateGrantService(prisma, actor, eventId, grantId, input);
    revalidatePath(`/organizer/events/${eventId}/access-codes`);
    revalidatePath(`/organizer/events/${eventId}/tickets`);
    return { success: true };
  } catch (error) {
    return failure(error, "Couldn't save the code. Please try again.");
  }
}

export async function revokeGrant(
  eventId: string,
  grantId: string
): Promise<ActionResult> {
  const actor = await guestAccessActor();
  if (!actor) return UNAVAILABLE;
  try {
    await revokeGrantService(prisma, actor, eventId, grantId);
    revalidatePath(`/organizer/events/${eventId}/access-codes`);
    revalidatePath(`/organizer/events/${eventId}/tickets`);
    return { success: true };
  } catch (error) {
    return failure(error, "Couldn't revoke the code. Please try again.");
  }
}
